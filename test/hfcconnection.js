/*
 * IBM Confidential
 * OCO Source Materials
 * IBM Concerto - Blockchain Solution Framework
 * Copyright IBM Corp. 2016
 * The source code for this program is not published or otherwise
 * divested of its trade secrets, irrespective of what has
 * been deposited with the U.S. Copyright Office.
 */

'use strict';

const ConnectionManager = require('../lib/hfcconnectionmanager');
const hfc = require('hfc');
const hfcChain = hfc.Chain;
const hfcEventHub = hfc.EventHub;
const hfcMember = hfc.Member;
const HFCConnection = require('../lib/hfcconnection');
const HFCSecurityContext = require('../lib/hfcsecuritycontext');
const HFCUtil = require('../lib/hfcutil');
const sinon = require('sinon');
const version = require('../package.json').version;

require('chai').should();

describe('HFCConnection', () => {

    let sandbox;
    let mockConnectionManager;
    let mockChain;
    let mockEventHub;
    let mockMember;
    let mockSecurityContext;
    let connection;

    beforeEach(() => {
        sandbox = sinon.sandbox.create();
        mockConnectionManager = sinon.createStubInstance(ConnectionManager);
        mockEventHub = sinon.createStubInstance(hfcEventHub);
        mockMember = sinon.createStubInstance(hfcMember);
        mockChain = sinon.createStubInstance(hfcChain);
        mockChain.getEventHub.returns(mockEventHub);
        mockChain.enroll.callsArgWith(2, null, mockMember);
        mockSecurityContext = sinon.createStubInstance(HFCSecurityContext);
        connection = new HFCConnection(mockConnectionManager, mockChain);
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('#disconnect', function () {

        it('should do nothing if not connected', () => {
            return connection.disconnect();
        });

        it('should disconnect the event hub if connected', () => {

            // Set up the hfc mock.
            return connection.disconnect()
                .then(() => {
                    sinon.assert.calledOnce(mockChain.eventHubDisconnect);
                    return connection.disconnect();
                })
                .then(() => {
                    sinon.assert.calledOnce(mockChain.eventHubDisconnect);
                });

        });

    });

    describe('#login', function () {

        it('should throw when enrollmentID not specified', function () {
            (function () {
                connection.login(null, 'suchsecret');
            }).should.throw(/enrollmentID not specified/);
        });

        it('should throw when enrollmentSecret not specified', function () {
            (function () {
                connection.login('doge', null);
            }).should.throw(/enrollmentSecret not specified/);
        });

        it('should enroll against the Hyperledger Fabric', function () {

            // Login to the Hyperledger Fabric using the mock hfc.
            let enrollmentID = 'doge';
            let enrollmentSecret = 'suchsecret';
            return connection
                .login('doge', 'suchsecret')
                .then(function (securityContext) {
                    sinon.assert.calledOnce(mockChain.enroll);
                    sinon.assert.calledWith(mockChain.enroll, enrollmentID, enrollmentSecret);
                    securityContext.should.be.a.instanceOf(HFCSecurityContext);
                    securityContext.getEnrolledMember().should.equal(mockMember);
                    securityContext.getEventHub().should.equal(mockEventHub);
                });

        });

        it('should handle an error from enrolling against the Hyperledger Fabric', function () {

            // Set up the hfc mock.
            mockChain.enroll.onFirstCall().callsArgWith(2, new Error('failed to login'), null);

            // Login to the Hyperledger Fabric using the mock hfc.
            let enrollmentID = 'doge';
            let enrollmentSecret = 'suchsecret';
            return connection
                .login(enrollmentID, enrollmentSecret)
                .then(function (securityContext) {
                    throw new Error('should not get here');
                }).catch(function (error) {
                    error.should.match(/failed to login/);
                });

        });

    });

    describe('#deploy', function () {

        it('should perform a security check', () => {
            sandbox.stub(HFCUtil, 'securityCheck');
            sandbox.stub(HFCUtil, 'deployChainCode', function () {
                return Promise.resolve({
                    chaincodeID: 'muchchaincodeID'
                });
            });
            sandbox.stub(connection, 'ping').returns(Promise.resolve());
            return connection.deploy(mockSecurityContext)
                .then(() => {
                    sinon.assert.calledOnce(HFCUtil.securityCheck);
                });
        });

        it('should deploy the Concerto chain-code to the Hyperledger Fabric', function () {

            // Set up the responses from the chain-code.
            sandbox.stub(HFCUtil, 'deployChainCode', function () {
                return Promise.resolve({
                    chaincodeID: 'muchchaincodeID'
                });
            });
            sandbox.stub(connection, 'ping').returns(Promise.resolve());

            // Invoke the getAllAssetRegistries function.
            return connection
                .deploy(mockSecurityContext)
                .then(function () {

                    // Check that the query was made successfully.
                    sinon.assert.calledOnce(HFCUtil.deployChainCode);
                    sinon.assert.calledWith(HFCUtil.deployChainCode, mockSecurityContext, 'concerto', 'init', []);
                    sinon.assert.calledOnce(connection.ping);
                    sinon.assert.calledWith(connection.ping, mockSecurityContext);

                    // Check that the security context was updated correctly.
                    sinon.assert.calledOnce(mockSecurityContext.setChaincodeID);
                    sinon.assert.calledWith(mockSecurityContext.setChaincodeID, 'muchchaincodeID');

                });

        });

        it('should handle an error deploying the Concerto chain-code the Hyperledger Fabric', function () {

            // Set up the responses from the chain-code.
            sandbox.stub(HFCUtil, 'deployChainCode', function () {
                return Promise.reject(
                    new Error('failed to deploy chain-code')
                );
            });

            // Invoke the getAllAssetRegistries function.
            return connection
                .deploy(mockSecurityContext)
                .then(function (assetRegistries) {
                    throw new Error('should not get here');
                }).catch(function (error) {
                    error.should.match(/failed to deploy chain-code/);
                });

        });

    });

    describe('#ping', () => {

        it('should perform a security check', () => {
            sandbox.stub(HFCUtil, 'securityCheck');
            sandbox.stub(HFCUtil, 'queryChainCode', function () {
                return Promise.resolve(Buffer.from(JSON.stringify({
                    version: version
                })));
            });
            return connection.queryChainCode(mockSecurityContext, 'myfunc', ['arg1', 'arg2'])
                .then(() => {
                    sinon.assert.calledOnce(HFCUtil.securityCheck);
                });
        });

        it('should resolve if the package and chaincode version match', () => {

            // Set up the responses from the chain-code.
            sandbox.stub(HFCUtil, 'queryChainCode', function () {
                return Promise.resolve(Buffer.from(JSON.stringify({
                    version: version
                })));
            });

            // Invoke the ping function.
            return connection
                .ping(mockSecurityContext)
                .then(function () {

                    // Check that the query was made successfully.
                    sinon.assert.calledOnce(HFCUtil.queryChainCode);
                    sinon.assert.calledWith(HFCUtil.queryChainCode, mockSecurityContext, 'ping', []);

                });

        });

        it('should throw an error if the package and chaincode version do not match', () => {

            // Set up the responses from the chain-code.
            sandbox.stub(HFCUtil, 'queryChainCode', function () {
                return Promise.resolve(Buffer.from(JSON.stringify({
                    version: '2016.12.25'
                })));
            });

            // Invoke the ping function.
            return connection
                .ping(mockSecurityContext)
                .then(function () {
                    throw new Error('should not get here');
                }).catch(function (error) {
                    error.should.match(/Deployed chain-code \(2016.12.25\) is incompatible with client \(.+?\)/);
                });

        });

    });

    describe('#queryChainCode', () => {

        it('should perform a security check', () => {
            sandbox.stub(HFCUtil, 'securityCheck');
            sandbox.stub(HFCUtil, 'queryChainCode').returns(Promise.resolve());
            return connection.queryChainCode(mockSecurityContext, 'myfunc', ['arg1', 'arg2'])
                .then(() => {
                    sinon.assert.calledOnce(HFCUtil.securityCheck);
                });
        });

        it('should query the chain code', () => {
            sandbox.stub(HFCUtil, 'securityCheck');
            sandbox.stub(HFCUtil, 'queryChainCode').returns(Promise.resolve());
            return connection.queryChainCode(mockSecurityContext, 'myfunc', ['arg1', 'arg2'])
                .then(() => {
                    sinon.assert.calledOnce(HFCUtil.queryChainCode);
                    sinon.assert.calledWith(HFCUtil.queryChainCode, mockSecurityContext, 'myfunc', ['arg1', 'arg2']);
                });
        });

    });

    describe('#invokeChainCode', () => {

        it('should perform a security check', () => {
            sandbox.stub(HFCUtil, 'securityCheck');
            sandbox.stub(HFCUtil, 'invokeChainCode').returns(Promise.resolve());
            return connection.invokeChainCode(mockSecurityContext, 'myfunc', ['arg1', 'arg2'])
                .then(() => {
                    sinon.assert.calledOnce(HFCUtil.securityCheck);
                });
        });

        it('should query the chain code', () => {
            sandbox.stub(HFCUtil, 'securityCheck');
            sandbox.stub(HFCUtil, 'invokeChainCode').returns(Promise.resolve());
            return connection.invokeChainCode(mockSecurityContext, 'myfunc', ['arg1', 'arg2'])
                .then(() => {
                    sinon.assert.calledOnce(HFCUtil.invokeChainCode);
                    sinon.assert.calledWith(HFCUtil.invokeChainCode, mockSecurityContext, 'myfunc', ['arg1', 'arg2']);
                });
        });

    });

});
