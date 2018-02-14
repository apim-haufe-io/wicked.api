'use strict';

var fs = require('fs');
var path = require('path');
var debug = require('debug')('portal-api:approvals');
var utils = require('./utils');
var users = require('./users');

var approvals = require('express').Router();

// ===== ENDPOINTS =====

approvals.get('/', function (req, res, next) {
    approvals.getApprovals(req.app, res, req.apiUserId);
});

// ===== IMPLEMENTATION =====

approvals.loadApprovals = function(app) {
    debug('loadApprovals()');
    var approvalsDir = path.join(utils.getDynamicDir(app), 'approvals');
    var approvalsFile = path.join(approvalsDir, '_index.json');
    if (!fs.existsSync(approvalsFile))
        throw new Error('Internal Server Error - Approvals index not found.');
    return JSON.parse(fs.readFileSync(approvalsFile, 'utf8'));
};

approvals.saveApprovals = function(app, approvalInfos) {
    debug('saveApprovals()');
    debug(approvalInfos);
    var approvalsDir = path.join(utils.getDynamicDir(app), 'approvals');
    var approvalsFile = path.join(approvalsDir, '_index.json');
    fs.writeFileSync(approvalsFile, JSON.stringify(approvalInfos, null, 2), 'utf8');
};

approvals.getApprovals = function(app, res, loggedInUserId) {
    debug('getApprovals()');
    if (!loggedInUserId)
        return res.status(403).jsonp({ message: 'Not allowed' });
    var userInfo = users.loadUser(app, loggedInUserId);
    if (!userInfo)
        return res.status(403).jsonp({ message: 'Not allowed' });
    if (!userInfo.admin && !userInfo.approver)
        return res.status(403).jsonp({ message: 'Not allowed' });

    var approvalInfos = approvals.loadApprovals(app);
    approvalInfos = approvalInfos.filter(function(approval) {
      if(userInfo.admin) return true; //Show all approvals for admin
      if(!userInfo.groups) return false; //Approver is not attached to a group (un-likely)
      if(!approval.api.requiredGroup) return false; //Api is not attached any group

      var groups = utils.loadGroups(app);
      groups = groups.groups;
      if(!groups) return false;
      var usrGroupsHash = {};
      for(var i=0; i< userInfo.groups.length; i++){
        usrGroupsHash[userInfo.groups[i]] = userInfo.groups[i];
      }
      for(var i=0; i< groups.length; i++){
        if(groups[i].id==usrGroupsHash[groups[i].id]){
          var alt_ids = groups[i].alt_ids;
          if(alt_ids){
            for(var j=0; j< alt_ids.length; j++){
              usrGroupsHash[alt_ids[j]] = alt_ids[j];
            }
          }
        }
      }
      //if group id or alt_id of approvar's group matches with requiredGroup of an API, return happy
      return (usrGroupsHash[approval.api.requiredGroup]==approval.api.requiredGroup);
    });
    res.json(approvalInfos);
};

module.exports = approvals;
