'use strict';

var path = require('path');
var fs = require('fs');
var { debug, info, warn, error } = require('portal-env').Logger('portal-api:content');
var users = require('./users');
var utils = require('./utils');

var content = require('express').Router();

// ===== ENDPOINTS =====

content.get('/', function (req, res, next) {
    content.getContent(req.app, res, req.apiUserId, req.path);
});

content.get('/toc', function (req, res, next) {
    content.getToc(req.app, res, req.apiUserId);
});

content.get('/*', function (req, res, next) {
    content.getContent(req.app, res, req.apiUserId, req.path);
});

// ===== IMPLEMENTATION =====

content._toc = null;
content.setup = function (app) {
    debug('setup()');

    content._toc = [];

    addApisToToc(app, content._toc);
    addContentToToc(app, content._toc);

    content._toc.sort(function (a, b) {
        if (a.category == b.category)
            return (a.title.localeCompare(b.title));
        return a.category.localeCompare(b.category);
    });
};

function makeTocEntry(category, url, title, subTitle, requiredGroup, tags) {
    return {
        category: category,
        url: url,
        title: title,
        subTitle: subTitle,
        requiredGroup: requiredGroup,
        tags: tags
    };
}

function addApisToToc(app, toc) {
    var apiList = utils.loadApis(app);
    for (var i = 0; i < apiList.apis.length; ++i) {
        var thisApi = apiList.apis[i];
        toc.push(makeTocEntry("api",
            "/apis/" + thisApi.id,
            thisApi.name,
            thisApi.desc,
            thisApi.requiredGroup,
            thisApi.tags));
    }
}

function addContentToToc(app, toc) {
    var contentBase = path.join(utils.getStaticDir(), 'content');

    addContentDirToToc(app, contentBase, '/content/', toc);
}

function addContentDirToToc(app, dir, uriPart, toc) {
    var fileNames = fs.readdirSync(dir);
    for (var i = 0; i < fileNames.length; ++i) {
        var fileName = fileNames[i];
        if (fileName.toLowerCase().endsWith('.json'))
            continue;

        var stat = fs.statSync(path.join(dir, fileName));
        if (stat.isDirectory()) {
            // Recurse please
            addContentDirToToc(app, path.join(dir, fileName), uriPart + fileName + '/', toc);
            continue;
        }

        var isJadeFile = fileName.toLowerCase().endsWith('.jade');
        var isMarkdownFile = fileName.toLowerCase().endsWith('.md');
        if (!isJadeFile && !isMarkdownFile)
            continue;
        var strippedFileName = null;
        if (isJadeFile)
            strippedFileName = fileName.substring(0, fileName.length - 5);
        if (isMarkdownFile)
            strippedFileName = fileName.substring(0, fileName.length - 3);
        var jsonFileName = path.join(dir, strippedFileName + '.json');
        if (!fs.existsSync(jsonFileName)) {
            debug('JADE or MD file without companion JSON file: ' + fileName);
            continue;
        }

        var metaData = JSON.parse(fs.readFileSync(jsonFileName, 'utf8'));

        toc.push(makeTocEntry(
            'content',
            uriPart + strippedFileName,
            metaData.title,
            metaData.subTitle,
            metaData.requiredGroup,
            metaData.tags));
    }
}

content.getToc = function (app, res, loggedInUserId) {
    debug('getToc()');
    if (!content._toc)
        return res.status(500).json({ message: 'Internal Server Error. Table of Content not initialized.' });

    // This is fairly expensive. TODO: This should be cached.
    var groups = utils.loadGroups(app);
    var groupRights = {};
    // Initialize for not logged in users
    for (let i = 0; i < groups.groups.length; ++i) {
        groupRights[groups.groups[i].id] = false;
    }
    if (loggedInUserId) {
        users.loadUser(app, loggedInUserId, (err, userInfo) => {
            if (err)
                return utils.fail(res, 500, 'getToc: loadUser failed', err);
            if (!userInfo)
                return utils.fail(res, 400, 'Bad Request. Unknown User ID.');
            if (userInfo.groups) {
                for (let i = 0; i < groups.groups.length; ++i) {
                    var groupId = groups.groups[i].id;
                    groupRights[groupId] = users.hasUserGroup(app, userInfo, groupId);
                }
            }
            return res.json(filterToc(groupRights));
        });
    } else {
        // No group rights (empty set {})
        res.json(filterToc(groupRights));
    }
};

function filterToc(groupRights) {
    var userToc = [];
    for (let i = 0; i < content._toc.length; ++i) {
        var tocEntry = content._toc[i];
        var addThis = false;
        if (!tocEntry.requiredGroup)
            addThis = true;
        if (!addThis && groupRights[tocEntry.requiredGroup])
            addThis = true;

        if (addThis)
            userToc.push(tocEntry);
    }
    return userToc;
}

content.isPublic = function (uriName) {
    return uriName.endsWith('jpg') ||
        uriName.endsWith('jpeg') ||
        uriName.endsWith('png') ||
        uriName.endsWith('gif') ||
        uriName.endsWith('css');
};

content.getContentType = function (uriName) {
    if (uriName.endsWith('jpg') ||
        uriName.endsWith('jpeg'))
        return "image/jpeg";
    if (uriName.endsWith('png'))
        return "image/png";
    if (uriName.endsWith('gif'))
        return "image/gif";
    if (uriName.endsWith('css'))
        return "text/css";
    return "text/markdown";
};

content.getContent = function (app, res, loggedInUserId, pathUri) {
    debug('getContent(): ' + pathUri);
    if (!/^[a-zA-Z0-9\-_\/\.]+$/.test(pathUri))
        return res.status(404).jsonp({ message: "Not found: " + pathUri });
    if (/\.\./.test(pathUri))
        return res.status(400).jsonp({ message: "Bad request. Baaad request." });

    // QUICK AND DIRTY?!
    var contentPath = pathUri.replace('/', path.sep);
    var staticDir = utils.getStaticDir();

    var filePath = path.join(staticDir, 'content', contentPath);

    if (content.isPublic(filePath.toLowerCase())) {
        if (!fs.existsSync(filePath))
            return res.status(404).jsonp({ message: 'Not found.: ' + pathUri });
        let contentType = content.getContentType(filePath);
        // Just serve it
        fs.readFile(filePath, function (err, content) {
            res.setHeader('Content-Type', contentType);
            res.send(content);
        });
        return;
    }

    // Special case: index
    if (pathUri == "/")
        filePath = path.join(staticDir, 'index');

    var mdFileName = filePath + '.md';
    var jadeFileName = filePath + '.jade';
    var metaName = filePath + '.json';
    var mdExists = fs.existsSync(mdFileName);
    var jadeExists = fs.existsSync(jadeFileName);

    if (!mdExists && !jadeExists)
        return res.status(404).jsonp({ message: 'Not found: ' + pathUri });

    var contentType;
    var fileName;
    if (mdExists) {
        fileName = mdFileName;
        contentType = 'text/markdown';
    } else { // jade
        fileName = jadeFileName;
        contentType = 'text/jade';
    }

    var metaInfo = { showTitle: false };
    if (fs.existsSync(metaName)) {
        metaInfo = JSON.parse(fs.readFileSync(metaName, 'utf8'));
    }
    if (metaInfo.requiredGroup) {
        users.loadUser(app, loggedInUserId, (err, userInfo) => {
            if (err)
                return utils.fail(res, 500, 'getContent: loadUser failed', err);
            if (!userInfo || // requiredGroup but no user, can't be right
                !users.hasUserGroup(app, userInfo, metaInfo.requiredGroup))
                return utils.fail(res, 403, 'Not allowed.');
            sendContent(res, metaInfo, fileName, contentType);
        });
    } else {
        sendContent(res, metaInfo, fileName, contentType);
    }
};

function sendContent(res, metaInfo, fileName, contentType) {
    debug('sendContent()');
    // Yay! We're good!
    var metaInfo64 = new Buffer(JSON.stringify(metaInfo)).toString("base64");
    fs.readFile(fileName, function (err, content) {
        if (err)
            return utils.fail(res, 500, 'Unexpected error', err);
        res.setHeader('X-MetaInfo', metaInfo64);
        res.setHeader('Content-Type', contentType);
        res.send(content);
    });
}

module.exports = content;
