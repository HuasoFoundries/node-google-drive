const Promise = require('bluebird'),
    _ = require('lodash'),
    path = require('path'),
    fs = Promise.promisifyAll(require('fs')),
    this_script = path.basename(__filename, path.extname(__filename)),
    debug = require('debug')(`${this_script}`),
    readline = require('readline'),
    google = require('googleapis'),
    GoogleAuth = require('google-auth-library');

/**
 * A module that allows the user to interact with google drive's API
 *
 * @class      NodeGoogleDrive
 * @param {Object} options - The options
 *
 * @returns     {Object}  the instance of this class with its options and constants set
 */
var NodeGoogleDrive = function (options) {
    var _this = this;

    this.name = 'Node Google Drive';

    if (!options) {
        options = {};
    }
    _this.options = options;
    _this.options.ROOT_FOLDER = _this.options.ROOT_FOLDER || null;
    _this.options.GOOGLE_AUTH_SCOPE = _this.options.GOOGLE_AUTH_SCOPE || ['https://www.googleapis.com/auth/drive'];

    var auth_client = new GoogleAuth();
    var oauth2Client;
    // var jwt_client;

    _this.service = {
        files: null
    };

    /**
     * Sets the setvice.
     *
     * @param      {Object}  google_auth  - google auth type instance. Either Oauth2 or JWT
     * @return     {Object}  service property of this instance, with promisified methods for the files namespace
     */
    var setSetvice = function (google_auth) {

        return Promise.try(function () {
            let service = google.drive({
                version: 'v3',
                auth: google_auth
            });
            return service;
        }).then(function (service) {
            _this.service.files = Promise.promisifyAll(service.files);

            return _this.service;
        });

    };

    var storeOauthToken = function (new_token, token_path) {
        return fs.writeFileAsync(token_path, JSON.stringify(new_token, null, 4))
            .then(function () {
                console.log('Token stored to ' + token_path);
                return new_token;
            });

    };

    var renewOauthToken = function (google_auth, token_path) {
        return Promise.try(function () {

            google_auth.refreshAccessToken(function (err, new_token) {
                return storeOauthToken(new_token, token_path);
            }).then(function (new_token) {
                google_auth.credentials = new_token;
                debug('new token expiry date', new_token.expiry_date);
                return setSetvice(google_auth);
            });
        });
    };

    /**
     * Get and store new token after prompting for user authorization, and then
     * execute the given callback with the authorized OAuth2 client.
     *
     * @param      {google.auth.OAuth2}  google_auth  The OAuth2 client to get token for
     * @param      {string}              token_path   The token path
     * @return     {Promise<Object>}     The service property of this instance
     */
    var getNewOauthToken = function (google_auth, token_path) {

        return Promise.try(function () {

            var authUrl = google_auth.generateAuthUrl({
                access_type: 'offline',
                scope: _this.options.GOOGLE_AUTH_SCOPE
            });
            console.log('Authorize this app by visiting this url: ', authUrl);
            var rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            rl.question('Enter the code from that page here: ', function (code) {
                rl.close();
                google_auth.getToken(code, function (err, new_token) {
                    google_auth.credentials = new_token;
                    return storeOauthToken(new_token, token_path);
                }).then(function () {
                    return setSetvice(google_auth);
                });
            });

        });
    };

    /**
     * Create an OAuth2 client with the given credentials, and then execute the
     * given callback function.
     *
     * @param {Object} credentials The authorization client credentials.
     * @param {string} token_path the path to store the client token
     *
     * @return {Promise} a promise that unfolds to a new auth token
     */
    var authorizeClientSecret = function (credentials, token_path) {
        var clientSecret = credentials.installed.client_secret;
        var clientId = credentials.installed.client_id;
        var redirectUrl = credentials.installed.redirect_uris[0];
        var google_auth = new auth_client.OAuth2(clientId, clientSecret, redirectUrl);

        // Check if we have previously stored a token.
        return fs.readFileAsync(token_path)
            .then(function (token) {

                google_auth.credentials = JSON.parse(token);

                return renewOauthToken(google_auth, token_path);

            }).catch(function (err) {

                debug(err);
                return getNewOauthToken(google_auth, token_path);

            });
    };

    var renewJwtAuth = function (google_auth) {
        return new Promise(function (resolve, reject) {

            google_auth.authorize(function (err, token) {
                if (err) {
                    reject(err);
                }
                resolve(setSetvice(google_auth));

            });

        });

    };

    // Request an auth token using a client secret json file
    _this.requestAuthToken = function (creds, token_path) {
        return Promise.try(function () {
            let credsObj;
            if (typeof creds === 'string') {
                credsObj = require(creds);
            } else if (typeof creds === 'object') {
                credsObj = creds;
            }
            return credsObj;
        }).then(function () {
            return authorizeClientSecret(creds, token_path);
        });
    };

    // Use a service account
    _this.useServiceAccountAuth = function (creds) {

        return Promise.try(function () {

            let credsObj;

            if (typeof creds === 'string') {
                credsObj = require(creds);
            } else if (typeof creds === 'object') {
                credsObj = creds;
            }
            return credsObj;
        }).then(function (credsObj) {
            let google_auth = new auth_client.JWT(credsObj.client_email,
                null,
                credsObj.private_key,
                _this.options.GOOGLE_AUTH_SCOPE,
                null);
            return renewJwtAuth(google_auth);
        });

    };

    // Use an existing auth token
    _this.useAuthToken = function (token, cb) {

    };

    _this.isAuthActive = function (google_auth) {
        return !!google_auth;
    };

    return _this;
};

/**
 * List files (optionally, start from the specified folder, if set)
 * @see  https://developers.google.com/drive/v3/reference/files/list
 * @see  https://developers.google.com/drive/v3/reference/files#resource
 * @param {string} [parentFolder] - id of the folder from which to search. Defaults to the ROOT_FOLDER passed in the options
 * @param {string} [pageToken]    - the page token of a previous request, when the prior result is paginated
 * @param {string} [recursive]    - wether to list also files in subfolders of the requested parentFolder. defaults to true.
 * If false, omits the files under subfolders. Works only when parentFolder is explicitly set
 *
 * @return {Array}  array of file resources results
 */
NodeGoogleDrive.prototype.listFiles = function (parentFolder, pageToken, recursive) {
    var _this = this;
    var folderId = parentFolder || _this.options.ROOT_FOLDER;

    var request = {
        includeRemoved: false,
        spaces: 'drive',
        pageSize: 100,
        fields: 'nextPageToken, files(id, name, parents, mimeType, modifiedTime)'
    };

    // If pageToken is set, then request the next page of file list
    if (pageToken) {
        request.pageToken = pageToken;
    }

    // If parent folder is set, list files under that folder
    if (folderId !== null) {
        request.fileId = folderId;

        // If recursive is explicitly set to false, the limit the list to files that have
        // the given parent folder as parent
        if (recursive === false) {
            request.q = `'${parentFolder}' in parents`;
        }

    }
    var listAsync = Promise.promisify(_this.service.files.list);

    return listAsync(request)
        .then(function (response) {

            debug('Found %s files on folder %s', response.files.length, folderId);
            response.parentFolder = folderId;
            return response;

        }).catch(function (err) {
            debug('Error listing files ', err.message);
            throw err;
        });
};

/**
 * List folders (optionally, start from the specified folder, if set)
 * @see  https://developers.google.com/drive/v3/reference/files/list
 * @see  https://developers.google.com/drive/v3/reference/files#resource
 * @param {string} [parentFolder] - id of the folder from which to search. Defaults to the ROOT_FOLDER passed in the options
 * @param {string} [pageToken]    - the page token of a previous request, when the prior result is paginated
 * @param {string} [recursive]    - wether to list also files in subfolders of the requested parentFolder. defaults to true.
 * If false, omits the files under subfolders. Works only when parentFolder is explicitly set
 *
 * @return {Array}  array of folder resources results
 */
NodeGoogleDrive.prototype.listFolders = function (parentFolder, pageToken, recursive) {
    var _this = this;
    var folderId = parentFolder || _this.options.ROOT_FOLDER;

    var request = {
        includeRemoved: false,
        spaces: 'drive',
        pageSize: 100,
        fields: 'nextPageToken, files(id, name, parents, mimeType, modifiedTime)'
    };

    // If pageToken is set, then request the next page of file list
    if (pageToken) {
        request.pageToken = pageToken;
    }

    // If parent folder is set, list files under that folder
    if (folderId !== null) {
        request.fileId = folderId;

        // If recursive is explicitly set to false, the limit the list to files that have
        // the given parent folder as parent
        if (recursive === false) {
            request.q = `'${parentFolder}' in parents`;
        }

    }
    var listAsync = Promise.promisify(_this.service.files.list);

    return listAsync(request)
        .then(function (response) {

            if (response.files.length) {
                let folders = _.filter(response.files, function (file) {
                    return file.mimeType === 'application/vnd.google-apps.folder';
                });
                response.folders = folders;
            } else {
                response.folders = [];
            }
            debug('Found %s folders on parent folder %s', response.folders.length, folderId);
            response.parentFolder = folderId;
            return _.omit(response, ['files']);

        }).catch(function (err) {
            debug('Error listing files ', err.message);
            throw err;
        });
};

/**
 * Writes a text file.
 *
 * @param {string} content               - The content of the text file
 * @param {string} [parentFolder]        - The parent folder on which to write. Defaults to the ROOT_FOLDER passed in the constructor options
 * @param {string} [destinationFilename] - The destination filename
 *
 * @returns {Promise<Object>} the response from google drive
 */
NodeGoogleDrive.prototype.writeTextFile = function (content, parentFolder, destinationFilename) {
    var _this = this;
    var folderId = parentFolder || _this.options.ROOT_FOLDER;
    var fileMetadata = {
        name: destinationFilename || 'Text_file_' + Date.now(),
        mimeType: 'text/plain'
    };
    if (folderId !== null) {
        fileMetadata.parents = [folderId];
    }
    var createAsync = Promise.promisify(_this.service.files.create);
    return _this.service.files.createAsync({
        resource: fileMetadata,
        media: {
            mimeType: 'text/plain',
            body: content || 'Hello World'
        }
    }).then(function (response) {

        debug('Wrote file to Google Drive', response);
        return response;

    }).catch(function (err) {
        debug('The API returned an error: ', err.message);
        throw err;
    });

};

NodeGoogleDrive.prototype.removeFile = function (fileId) {

    return this.service.files.deleteAsync({
        fileId: fileId,
        resource: {
            fileId: fileId
        }
    });

};

/**
 * Writes a PDF File
 *
 * @param {string} sourcefile            - The source file from which to read the content of the PDF File to upload
 * @param {string} [parentFolder]        - The parent folder on which to write. Defaults to the ROOT_FOLDER passed in the constructor options
 * @param {string} [destinationFilename] - The destination filename
 *
 * @returns {Promise<Object>} the response from google drive
 */
NodeGoogleDrive.prototype.writePDFFile = function (sourcefile, parentFolder, destinationFilename) {
    var _this = this;
    var defaultsource = path.resolve(__dirname + '/../rep_CB/municipales_2017-07-10/reporte_municipalidad_de_huechuraba_2017-07-10_week.pdf');
    var mimeType = 'application/pdf';
    var folderId = parentFolder || _this.options.ROOT_FOLDER;

    var fileMetadata = {
        name: destinationFilename || 'Test2.pdf',
        mimeType: mimeType
    };
    if (folderId !== null) {
        fileMetadata.parents = [folderId];
    }

    var pdf_path = sourcefile || defaultsource;
    return _this.service.files.createAsync({
        resource: fileMetadata,
        media: {
            mimeType: mimeType,
            body: fs.createReadStream(pdf_path)
        }
    }).then(function (response) {

        //debug('Wrote file to Google Drive', response);
        return response;

    }).catch(function (err) {
        //debug('The API returned an error: ', err);
        throw err;
    });
};

/**
 * Creates a folder in Google Drive
 *
 *  @param {string} [parentFolder]        - The parent folder on which to write. Defaults to the ROOT_FOLDER passed in the constructor options
 *  @param {string} [folderName]          - The name of the folder that will be created
 *
 * @returns {Promise<Object>} the response from google drive
 */
NodeGoogleDrive.prototype.createFolder = function (parentFolder, folderName) {
    var _this = this;
    var folderId = parentFolder || _this.options.ROOT_FOLDER;
    var fileMetadata = {
        name: folderName || 'Generic Folder',
        mimeType: 'application/vnd.google-apps.folder'
    };

    if (folderId !== null) {
        fileMetadata.parents = [folderId];
    }

    return _this.service.files.createAsync({
        resource: fileMetadata,
        fields: 'id'
    }).then(function (response) {

        debug('Created folder on Google Drive', response.id);
        return response;
    }).catch(function (err) {
        debug('The API returned an error: ', err.message);
        throw err;
    });

};

module.exports = NodeGoogleDrive;
