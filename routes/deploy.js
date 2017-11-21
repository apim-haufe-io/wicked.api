'use strict';

var utils = require('./utils');
var webhooks = require('./webhooks');
var initializer = require('./initializer');
var authMiddleware = require('../auth-middleware');
var path = require('path');
var fs = require('fs');
var debug = require('debug')('portal-api:deploy');
const exec = require('child_process').exec;
var crypto = require('crypto');
var async = require('async');

var deploy = require('express').Router();

/*
// ===== MIDDLEWARE =====

// All /deploy end points need an "Authorization" header which has to contain the deployment
// key which is used for decrypting/encrypting env variables and such.
deploy.use(authMiddleware.verifyConfigKey);

// ===== ENDPOINTS =====

// ------ EXPORT ------

deploy.post('/export', function (req, res, next) {
    deploy.initExport(req.app, res);
});

deploy.delete('/export/:exportId', function (req, res, next) {
    deploy.deleteExport(req.app, res, req.params.exportId);
});

deploy.get('/export/:exportId/status', function (req, res, next) {
    deploy.getExportStatus(req.app, res, req.params.exportId);
});

deploy.get('/export/:exportId/data', function (req, res, next) {
    deploy.getExportData(req.app, res, req.params.exportId);
});

// ------ IMPORT ------

deploy.post('/import', function (req, res, next) {
    deploy.initImport(req.app, req, req.get('X-SHA256-Hash'), res);
});

deploy.get('/import/:importId/status', function (req, res, next) {
    deploy.getImportStatus(req.app, res, req.params.importId);
});

// ===== IMPLEMENTATION =====

deploy.NO = { value: 0, message: 'No' };
deploy.PROCESSING = { value: 1, message: 'Processing.' };
deploy.DONE = { value: 2, message: 'Done.' };
deploy.FAILED = { value: 3, message: 'Failed.' };
deploy.CANCELLED = { value: 4, message: 'Cancelled.' };

deploy.MAX_TRIES = 10;
deploy.TRY_DELAY = 1000;

deploy.exportStatus = {
    exportId: null,
    status: deploy.NO,
    exportFileName: null,
    lastError: null
};

deploy.importStatus = {
    importId: null,
    status: deploy.NO,
    message: null,
    lastError: null
};

// ===== EXPORT =====

deploy.initExport = function (app, res) {
    debug('initExport()');
    if (deploy.exportStatus.status.value != deploy.NO.value)
        return res.status(409).json({ message: 'Conflict. Export already in process.' });

    // Do a global lock on the entire database    
    if (!utils.globalLock(app))
        return res.status(409).json({ message: 'Conflict. Export or import already in process.' });

    debug('initExport(): Initializing export');
    var exportId = utils.createRandomId();
    deploy.exportStatus.status = deploy.PROCESSING;
    deploy.exportStatus.exportId = exportId;

    res.status(201).json({
        exportId: exportId,
        _links: {
            status: {
                href: '/deploy/export/' + exportId + '/status'
            }
        }
    });

    // Do our thing...
    process.nextTick(function () { tryExport(app, 0); });
};

function tryExport(app, tryCount) {
    debug('tryExport(tryCount=' + tryCount + ')');
    debug(deploy.exportStatus);
    if (tryCount > deploy.MAX_TRIES) {
        debug('tryExport(): Retry count exceeded.');
        // Give up
        deploy.exportStatus.status = deploy.FAILED;
        deploy.exportStatus.status.message = 'Giving up after ' + deploy.MAX_TRIES + ' tries; there are still lock files.';
        finalizeExport(app);
        return;
    }

    if (cancelPending()) {
        // Cancelled
        cancelExport(app);
        return;
    }

    if (initializer.hasLockFiles(app)) {
        debug('tryExport(): There are open locks. Retry.');
        // Retry; this is not recursive, it just looks like it is.
        setTimeout(tryExport, deploy.TRY_DELAY, app, tryCount + 1);
        return;
    }

    // We're fine, we can start doing things now.
    doExport(app);
}

function getTmpDir(app) {
    var dynamicDir = utils.getDynamicDir(app);
    var tmpDir = path.join(dynamicDir, 'tmp');
    if (!fs.existsSync(tmpDir))
        fs.mkdirSync(tmpDir);
    return tmpDir;
}

function getTmpFileName(prefix, suffix) {
    var now = new Date();
    return prefix + now.getFullYear() +
        padLeft(now.getMonth()) +
        padLeft(now.getDate()) +
        "_" +
        padLeft(now.getHours()) +
        padLeft(now.getMinutes()) +
        padLeft(now.getSeconds()) +
        suffix;
}

function doExport(app) {
    debug('doExport()');

    // Set timeout for cancel of export; after a minute
    // we cancel the export automatically, to make sure the
    // system is not blocked. 
    deploy.resetRef = setTimeout(resetExport, 60000, app);

    var dynamicDir = utils.getDynamicDir(app);
    var tmpDir = getTmpDir(app);
    var configKey = app.get('config_key');

    var tarFileName = getTmpFileName('export_', '.tgz');

    var exportFilePath = path.join(tmpDir, tarFileName + '.enc');
    var tarFilePath = path.join(tmpDir, tarFileName);
    deploy.exportStatus.exportFileName = exportFilePath;

    var tarExec = "tar cfz tmp/" + tarFileName + " --exclude='tmp/*' *";
    var openSslExec = "openssl enc -aes-256-cbc -salt -k '" + configKey + "' -in '" + tarFilePath + "' -out '" + exportFilePath + "'";
    var options = { cwd: dynamicDir };
    async.series([
        function (callback) {
            debug(tarExec);
            exec(tarExec,
                options,
                function (err, stdin, stderr) {
                    debug('tar returned.');
                    if (err) {
                        debug('tar failed!');
                        debug(err);
                        return callback(err);
                    }
                    callback(null);
                });
        },
        function (callback) {
            debug(openSslExec);
            exec(openSslExec,
                options,
                function (err, stdin, stderr) {
                    debug('openSSL returned.');
                    if (err) {
                        debug('OpenSSL failed!');
                        debug(err);
                        return callback(err);
                    }
                    callback(null);
                });
        }
    ], function (err) {
        if (err) {
            debug('Export failed.');
            setNewStatus(app, deploy.FAILED, err);
            return;
        }

        debug('Export finished successfully.');
        setNewStatus(app, deploy.DONE, 'Finished export');

        return;
    });
}

function setNewStatus(app, status, message) {
    debug('setNewStatus(' + status.message + ')');
    if (!cancelPending()) {
        deploy.exportStatus.status = status;
        deploy.exportStatus.status.message = message;
    } else {
        cancelExport(app);
    }
}

function padLeft(n) {
    if (n < 10)
        return "0" + n;
    return "" + n;
}

function cancelPending() {
    debug(deploy.exportStatus.status);
    return deploy.exportStatus.status.value == deploy.CANCELLED.value;
}

function resetExport(app) {
    debug('resetExport()');
    deploy.resetRef = null;
    if (deploy.exportStatus.status.value == deploy.NO.value)
        return;
    cancelExport(app);
}

function cancelExport(app) {
    debug('cancelExport()');
    // In case this was called not from resetExport, the timeout
    // function resetExport does not need to be called.
    if (deploy.resetRef) {
        clearTimeout(deploy.resetRef);
        deploy.resetRef = null;
    }
    deploy.exportStatus.status = deploy.NO;
    deploy.exportStatus.exportId = null;
    finalizeExport(app);
}

function finalizeExport(app) {
    debug('finalizeExport()');
    if (utils.hasGlobalLock(app))
        utils.globalUnlock(app);
}

deploy.deleteExport = function (app, res, exportId) {
    debug('deleteExport()');
    if (deploy.exportStatus.exportId != exportId)
        return res.status(404).json({ message: 'Not found. Unknown export ID.' });

    switch (deploy.exportStatus.status.value) {
        case deploy.PROCESSING.value:
            deploy.exportStatus.status = deploy.CANCELLED;
            return res.status(202).json({ message: 'Scheduled cancellation of export.' });

        case deploy.DONE.value:
        case deploy.FAILED.value:
            cancelExport(app);
            return res.status(204).json({ message: 'Export cancelled.' });

        case deploy.CANCELLED.value:
            return res.status(204).json({ message: 'Cancellation is already scheduled.' });
    }

    debug('!!!! This should not happen.');
    res.status(400).json({ message: 'Bad request, invalid state.' });
};

deploy.getExportStatus = function (app, res, exportId) {
    debug('getExportStatus(' + exportId + ')');
    debug(deploy.exportStatus);
    if (deploy.exportStatus.exportId != exportId)
        return res.status(404).json({ message: 'Not found. Unknown export ID.' });

    switch (deploy.exportStatus.status.value) {
        case deploy.NO.value:
            // This should not be possible.
            res.status(500);
            break;
        case deploy.PROCESSING.value:
            res.status(204);
            break;
        case deploy.DONE.value:
            res.status(200);
            break;
        case deploy.FAILED.value:
            res.status(422);
            break;
        case deploy.CANCELLED.value:
            res.status(410); // Gone
            break;
    }

    res.json({
        status: deploy.exportStatus.status.value,
        message: deploy.exportStatus.status.message
    });
};

deploy.getExportData = function (app, res, exportId) {
    debug('getExportData()');
    if (deploy.exportStatus.exportId != exportId)
        return res.status(404).json({ message: 'Not found. Unknown export ID.' });
    if (deploy.exportStatus.status.value != deploy.DONE.value)
        return res.status(400).json({ message: 'Bad request. There is no finished export. Have you checked the status?' });
    var fileName = deploy.exportStatus.exportFileName;
    if (!fs.existsSync(fileName))
        return res.status(500).json({ message: 'Internal Server Error. Missing export file.' });

    debug('Export file: ' + fileName);
    sendBinary(res, fileName);
};

// ===== IMPORT =====

deploy.initImport = function (app, req, givenSha256, res) {
    debug('initImport()');
    if (deploy.importStatus.status.value == deploy.PROCESSING.value)
        return res.status(409).json({ message: 'Conflict, import already in progress.' });

    // Do a global lock on the entire database    
    //if (!utils.globalLock(app))
    //    return res.status(409).json({ message: 'Conflict. Export or import already in process.' });
    if (!givenSha256)
        return res.status(400).json({ message: 'Missing X-SHA256-Hash header.' });

    debug('initExport(): Initializing export');

    var tmpDir = getTmpDir(app);
    var importFileName = getTmpFileName('import_', '.enc');
    var importFilePath = path.join(tmpDir, importFileName);
    deploy.importStatus.importFileName = importFilePath;

    debug('Import file name: ' + importFilePath);
    debug('Import SHA256: ' + givenSha256);

    var fileStream = fs.createWriteStream(importFilePath);
    // Download the thing.
    req.on('data', function (data) {
        debug('req.on("data")');
        fileStream.write(data);
    });

    req.on('end', function () {
        debug('req.on("end")');
        async.series([
            function (callback) {
                fileStream.end(callback);
            },
            function (callback) {
                sha256Hash(importFilePath, function (hexHash) {
                    if (givenSha256 != hexHash) {
                        var err = new Error('Given SHA256 hash does not match actual SHA256 hash.');
                        return callback(err);
                    }
                    callback(null);
                });
            }
        ], function (err) {
            if (err) {
                console.error(err);
                return res.status(400).json({ message: 'Import failed.', error: err.message });
            }

            var importId = utils.createRandomId();
            deploy.importStatus.status = deploy.PROCESSING;
            deploy.importStatus.importId = importId;

            res.status(201).json({
                importId: importId,
                message: 'Accepted',
                _links: {
                    status: {
                        href: '/deploy/import/' + importId + '/status'
                    }
                }
            });

            // Do our thing...
            process.nextTick(function () { tryImport(app, 0); });
        });
    });

    req.on('error', function (err) {
        debug('Uploading import archive failed.');
        res.status(500).json({ message: 'Import file upload error.', error: err });
    });
};

function tryImport(app, tryCount) {
    debug('tryImport(tryCount=' + tryCount + ')');
    if (tryCount > deploy.MAX_TRIES) {
        debug('tryImport(): Retry count exceeded.');
        // Give up
        deploy.importStatus.status = deploy.FAILED;
        deploy.importStatus.status.message = 'Giving up after ' + deploy.MAX_TRIES + ' tries; there are still lock files.';
        finalizeImport(app);
        return;
    }

    var canProceed = true;
    if (utils.hasGlobalLock(app)) {
        debug('tryImport: Already globally locked - cannot proceed.');
        canProceed = false;
    }
    if (canProceed && initializer.hasLockFiles(app)) {
        debug('tryImport: There are lock files - cannot proceed.');
        canProceed = false;
    }
    if (!canProceed) {
        // Retry
        setTimeout(tryImport, deploy.TRY_DELAY, app, tryCount + 1);
        return;
    }

    debug('tryImport: Starting the import.');
    // Do da thing
    utils.globalLock(app);
    doImport(app);
}

function doImport(app) {
    debug('doImport()');
    // Switch off webhooks for the time being
    webhooks.disableAllHooks();

    var configKey = app.get('config_key');
    var decryptedTgz = deploy.importStatus.importFileName + '.tgz';
    var backupFileName = getTmpFileName('backup_', '.tgz');
    var dynamicDir = utils.getDynamicDir(app);

    // Four steps:
    // 1. Decrypt the import file
    // 2. Create a backup (tar)
    // 3. rm -rf of all data
    // 4. Untar import file
    //
    // If something goes wrong: Unpack the backup again
    var decryptExec = "openssl enc -aes-256-cbc -k '" + configKey + "' -d -in '" + deploy.importStatus.importFileName + "' -out '" + decryptedTgz + "'";
    var backupExec = "tar cfz 'tmp/" + backupFileName + "' --exclude='tmp/*' *";
    var rmExec = "rm -rf applications && rm -rf approvals && rm -rf subscriptions && rm -rf users && rm -rf verifications && rm -rf webhooks";
    var untarExec = "tar xfz '" + decryptedTgz + "'";
    var restoreExec = "tar xfz 'tmp/" + backupFileName + "'";

    var options = { cwd: dynamicDir };

    // This is why I both love and hate Javascript.
    var execHandler = function (desc, callback) {
        return function (err, stdin, stdout) {
            if (err) {
                console.error(desc + ' failed.');
                console.error(err);
                return callback(err);
            }
            debug(desc + ' succeeded.');
            callback(null);
        };
    };

    var needsRestore = false;
    async.series([
        function (callback) {
            debug(decryptExec);
            exec(decryptExec, options, execHandler('Decrypting', callback));
        },
        function (callback) {
            debug(backupExec);
            exec(backupExec, options, execHandler('Backup', callback));
        },
        function (callback) {
            debug(rmExec);
            needsRestore = true;
            exec(rmExec, options, execHandler('Deleting previous configuration', callback));
        },
        function (callback) {
            debug(untarExec);
            exec(untarExec, options, execHandler('Unpacking imported archive', callback));
        }
    ], function (err) {
        if (err) {
            cleanupAfterFailedImport(app, err, options, needsRestore, rmExec, restoreExec);
            return;
        }

        // We have successfully untar'ed the import archive; now we still have to verify
        // the dynamic content makes sense with the current static configuration.
        debug('Verifying dynamic configuration.');
        initializer.checkDynamicConfig(app, function (err, messages) {
            if (err) {
                console.error('initializer.checkDynamicConfig() caused an error.');
                cleanupAfterFailedImport(app, err, options, needsRestore, rmExec, restoreExec);
                return;
            }
            if (messages) {
                console.error('initializer.checkDynamicConfig() returned failed checks.');
                let err = new Error('initializer.checkDynamicConfig() returned failed checks: ' + JSON.stringify(messages));
                cleanupAfterFailedImport(app, err, options, needsRestore, rmExec, restoreExec);
                return;
            }

            debug('Import finished successfully.');
            // Success! Switch on webhooks and things again.
            finalizeImport(app);

            // This will notify kong-adapter that a re-sync is needed.
            // The callback is called as soon as the log event was definitely 
            // stored.
            webhooks.logEvent(app, {
                entity: webhooks.ENTITY_IMPORT,
                action: webhooks.ACTION_DONE
            }, function (err) {
                debug('Event "import finished" was issued.');
                // Now we just have to wait for the kong-adapter to finish its work,
                // then we really can set the status to "DONE"
                deploy.importStatus.message = 'Waiting for initial synchronization of API Gateway.';

                checkHooks(app, 0, function (err) {
                    debug('checkHooks() returned.');
                    if (err) {
                        console.error(err.message);
                        deploy.importStatus.status = deploy.FAILED;
                        deploy.importStatus.status.message = err.message;

                        webhooks.logEvent(app, {
                            entity: webhooks.ENTITY_IMPORT,
                            action: webhooks.ACTION_FAILED
                        });
                        return;
                    }

                    debug('Truly done. Setting import status to DONE.');
                    // Now we're truly done
                    deploy.importStatus.status = deploy.DONE;
                    deploy.importStatus.status.message = 'Import successfully finished.';
                    return;
                });
            });
        });
        return;
    });
}

function checkHooks(app, tryCount, callback) {
    debug('checkHooks()');
    if (tryCount >= 50) {
        var errorMsg = 'Pending webhooks were not removed from queue after 50 retries. Import failed.';
        return callback(new Error(errorMsg));
    }

    if (webhooks.pendingEventsCount(app) === 0)
        return callback(null);

    // Retry after 1000 ms
    setTimeout(checkHooks, 1000, app, tryCount + 1, callback);
}

function cleanupAfterFailedImport(app, err, options, needsRestore, rmExec, restoreExec) {
    debug('cleanupAfterFailedImport()');
    console.error('Import failed.');
    console.error(err);
    if (err.stack)
        console.error(err.stack);

    deploy.importStatus.status = deploy.FAILED;
    deploy.importStatus.status.message = err.message;

    try {
        webhooks.logEvent(app, {
            entity: webhooks.ENTITY_IMPORT,
            action: webhooks.ACTION_FAILED
        });
    } catch (err) {
        console.error('Logging event after failed import failed.');
        console.error(err);
    }

    if (needsRestore) {
        debug(rmExec);
        exec(rmExec, options, function (err, stdin, stdout) {
            if (err) {
                console.error('Deleting all the dynamic configuration failed. Will continue to restore backup anyway.');
            }
            debug(restoreExec);
            exec(restoreExec, options, function (err, stdin, stdout) {
                if (err) {
                    console.error('Error in backup restoration. This is real bad.');
                    console.error(err);
                }
                finalizeImport(app);
            });
        });
        return;
    } else {
        finalizeImport(app);
        return;
    }
}

function finalizeImport(app) {
    if (utils.hasGlobalLock(app))
        utils.globalUnlock(app);
    webhooks.enableAllHooks();
}

deploy.getImportStatus = function (app, res, importId) {
    debug('getImportStatus()');
    if (deploy.importStatus.importId != importId)
        return res.status(404).json({ message: 'Unknown import ID.' });

    switch (deploy.importStatus.status.value) {
        case deploy.PROCESSING.value:
            res.status(204);
            break;
        case deploy.FAILED.value:
            res.status(422);
            break;
        case deploy.DONE.value:
            res.status(200);
            break;
        default:
            console.error('getImportStatus() - Invalid status');
            res.status(500);
            break;
    }
    res.json({
        status: deploy.importStatus.status.value,
        message: deploy.importStatus.status.message
    });
};

// Exporting sub routines

function sha256Hash(fileName, callback) {
    var hash = crypto.createHash('sha256');
    var stream = fs.createReadStream(fileName);
    stream.on('data', function (data) {
        hash.update(data);
    });
    stream.on('end', function (data) {
        var hexHash = hash.digest('hex');
        callback(hexHash);
    });
}

function sendBinary(res, fileName) {
    debug('sendBinary("' + fileName + '")');
    sha256Hash(fileName, function (hexHash) {
        debug('SHA256 hash: ' + hexHash);
        res.sendFile(fileName, {
            headers: {
                'X-SHA256-Hash': hexHash
            }
        }, function (err) {
            if (err) {
                console.error('deploy.sendBinary failed');
                console.error(err);
                res.status(err.status).end();
            } else {
                debug('Sent file: ' + fileName);
            }
        });
    });
}
*/

module.exports = deploy;