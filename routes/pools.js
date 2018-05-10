'use strict';

const utils = require('./utils');
const { debug, info, warn, error } = require('portal-env').Logger('portal-api:verifications');

const pools = require('express').Router();

// ===== ENDPOINTS =====

pools.get('/', function (req, res, next) {
    debug(`GET /`);

    try {
        const poolInfos = utils.getPools();
        return res.json(poolInfos);
    } catch (err) {
        return utils.fail(res, 500, 'Could not read registration pool information.', err);
    }
});

pools.get('/:poolId', function (req, res, next) {
    const poolId = req.params.poolId;
    debug(`GET /pools/${poolId})`);

    try {
        const poolInfo = utils.getPool(poolId);
        return res.json(poolInfo);
    } catch (err) {
        return utils.fail(res, 500, `Could not read registration pool information for pool ID ${poolId}`, err);
    }
});

module.exports = pools;
