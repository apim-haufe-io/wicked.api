'use strict';

const { debug, info, warn, error } = require('portal-env').Logger('portal-api:dao:pg:subscriptions');

const utils = require('../../../routes/utils');
const daoUtils = require('../../dao-utils');

class PgSubscriptions {

    constructor(pgUtils) {
        this.pgUtils = pgUtils;
    }

    // =================================================
    // DAO contract
    // =================================================

    getByAppId(appId, callback) {
        debug(`getByAppId(${appId})`);
        this.pgUtils.checkCallback(callback);
        return this.getByAppIdImpl(appId, callback);
    }

    getByClientId(clientId, callback) {
        debug(`getByClientId(${clientId})`);
        this.pgUtils.checkCallback(callback);
        return this.getByClientIdImpl(clientId, callback);
    }

    getByAppAndApi(appId, apiId, callback) {
        debug(`getByAppAndApi(${appId}, ${apiId})`);
        this.pgUtils.checkCallback(callback);
        return this.getByAppAndApiImpl(appId, apiId, callback);
    }

    getByApi(apiId, offset, limit, callback) {
        debug(`getByApi(${apiId}, offset: ${offset}, limit: ${limit})`);
        this.pgUtils.checkCallback(callback);
        return this.getByApiImpl(apiId, offset, limit, callback);
    }

    getAll(filter, orderBy, offset, limit, noCountCache, callback) {
        debug('getAll()');
        this.pgUtils.checkCallback(callback);
        return this.getAllImpl(filter, orderBy, offset, limit, noCountCache, callback);
    }

    getIndex(offset, limit, callback) {
        debug('getIndex()');
        this.pgUtils.checkCallback(callback);
        return this.getIndexImpl(offset, limit, callback);
    }

    getCount(callback) {
        debug('getCount()');
        this.pgUtils.checkCallback(callback);
        return this.pgUtils.count('subscriptions', callback);
    }

    create(newSubscription, creatingUserId, callback) {
        debug(`create(${newSubscription.id})`);
        this.pgUtils.checkCallback(callback);
        return this.createImpl(newSubscription, creatingUserId, callback);
    }

    delete(appId, apiId, subscriptionId, callback) {
        debug(`delete(${appId}, ${apiId}, ${subscriptionId})`);
        // Note: appId and apiId aren't used for this DAO, as the subscription ID
        // is already unique.
        this.pgUtils.checkCallback(callback);
        return this.pgUtils.deleteById('subscriptions', subscriptionId, callback);
    }

    patch(appId, subsInfo, patchingUserId, callback) {
        debug(`patch(${appId}, ${subsInfo.id})`);
        this.pgUtils.checkCallback(callback);
        return this.patchImpl(appId, subsInfo, patchingUserId, callback);
    }

    // Legacy functionality which is used in the initializer; it's not possible
    // to take this out, but this does not have to be re-implemented for future
    // DAOs (actually, MUST not)

    legacyWriteSubsIndex(app, subs) { }
    legacySaveSubscriptionApiIndex(apiId, subs) { }

    // =================================================
    // DAO implementation/internal methods
    // =================================================

    getByAppIdImpl(appId, callback) {
        debug('getByAppIdImpl()');
        this.pgUtils.getBy('subscriptions', ['applications_id'], [appId], {}, (err, subsList) => {
            if (err)
                return callback(err);
            daoUtils.decryptApiCredentials(subsList);
            return callback(null, subsList);
        });
    }
  
    getAllImpl(filter, orderBy, offset, limit, noCountCache, callback) {
        debug(`getAll(filter: ${filter}, orderBy: ${orderBy}, offset: ${offset}, limit: ${limit})`);
        //return callback(new Error('PG.getAllImpl: Not implemented.'));
        const fields = [];
        const values = [];
        const operators = [];
        const joinedFields = [
           {
                source: 'a.api_group',
                as: 'api_group',
                alias: 'apiGroup'
            },       
            {
                source: 'a.data->>\'approved\'',
                as: 'approved',
                alias: 'approved'
            }, 
            {
                source: 'b.application_name',
                as: 'application_name',
                alias: 'applicationName'
            },
            {
                source: 'b.owner',
                as: 'owner',
                alias: 'owner'
            },
            {
                source: 'b.user',
                as: 'user',
                alias: 'user'
            },
            {
                source: 'b.userid',
                as: 'userid',
                alias: 'userid'
            }
     
        ];
        this.pgUtils.addFilterOptions(filter, fields, values, operators, joinedFields);
        // This may be one of the most complicated queries we have here...
        const options = {
            limit: limit,
            offset: offset,
            orderBy: orderBy ? orderBy : 'id ASC',
            operators: operators,
            noCountCache: noCountCache,
            joinedFields: joinedFields,
            joinClause: 'INNER JOIN (SELECT string_agg(o.data->>\'email\', \', \') as owner, string_agg(r.name, \', \') as user, string_agg(r.users_id, \', \') as userid, p.data->> \'name\' as application_name , p.id FROM wicked.applications p, wicked.owners o, wicked.registrations r WHERE o.applications_id = p.id AND o.users_id = r.users_id GROUP BY application_name, p.id) b ON b.id = a.applications_id'
        };
        
        return this.pgUtils.getBy('subscriptions', fields, values, options, (err, subsList, countResult) => {
            if (err)
                return callback(err);
            daoUtils.decryptApiCredentials(subsList);    
            return callback(null, subsList, countResult);
        });
    }


    getIndexImpl(offset, limit, callback) {
        debug(`getIndex(offset: ${offset}, limit: ${limit})`);
        this.pgUtils.getBy('subscriptions', [], [], { orderBy: 'id ASC' }, (err, subsList, countResult) => {
            if (err)
                return callback(err);
            const subIdList = subsList.map(sub => { return { id: sub.id }; });
            return callback(null, subIdList, countResult);
        });
    }

    getByApiImpl(apiId, offset, limit, callback) {
        debug('getByApiImpl()');
        this.pgUtils.getBy('subscriptions', ['api_id'], [apiId], { offset: offset, limit: limit }, (err, subsList, countResult) => {
            if (err)
                return callback(err);
            daoUtils.decryptApiCredentials(subsList);
            return callback(null, subsList, countResult);
        });
    }

    returnSingleSubs(callback) {
        return function (err, subsInfo) {
            if (err)
                return callback(err);
            if (!subsInfo)
                return callback(null, null);
            daoUtils.decryptApiCredentials([subsInfo]);
            return callback(null, subsInfo);
        };
    }

    getByClientIdImpl(clientId, callback) {
        debug('getByClientIdImpl()');
        this.pgUtils.getSingleBy(
            'subscriptions',
            'client_id',
            clientId,
            this.returnSingleSubs(callback));
    }

    getByAppAndApiImpl(appId, apiId, callback) {
        debug('getByAppAndApiImpl()');
        this.pgUtils.getSingleBy(
            'subscriptions',
            ['applications_id', 'api_id'],
            [appId, apiId],
            this.returnSingleSubs(callback));
    }

    createImpl(newSubscription, creatingUserId, callback) {
        debug('createImpl()');
        daoUtils.encryptApiCredentials([newSubscription]);
        this.pgUtils.upsert('subscriptions', newSubscription, creatingUserId, (err) => {
            if (err)
                return callback(err);
            return callback(null, newSubscription);
        });
    }

    patchImpl(appId, subsInfo, patchingUserId, callback) {
        debug('patchSync()');
        // This is actually just save...
        daoUtils.encryptApiCredentials([subsInfo]);
        this.pgUtils.upsert('subscriptions', subsInfo, patchingUserId, (err) => {
            if (err)
                return callback(err);
            return callback(null, subsInfo);
        });
    }
}

module.exports = PgSubscriptions;
