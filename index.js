const Promise = require('bluebird'),
  _ = require('lodash'),
  path = require('path'),
  fs = Promise.promisifyAll(require('fs')),
  debug = require('debug')(`node-google-drive:index`),
  readline = require('readline'),
  google = require('googleapis'),
  { GoogleAuth } = require('google-auth-library');

let defaultExportFormats = {
  'application/vnd.google-apps.site': {
    extension: 'zip',
    mimeType: 'application/zip'
  },
  'application/vnd.google-apps.document': {
    extension: 'docx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  },
  'application/vnd.google-apps.spreadsheet': {
    extension: 'xlsx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  },
  'application/vnd.google-apps.presentation': {
    extension: 'pptx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  },
  'application/vnd.google-apps.drawing': {
    extension: 'png',
    mimeType: 'image/png'
  }
};

let ROOT_FOLDER = '';

/**
 * A module that allows the user to interact with google drive's API
 *
 * @class      NodeGoogleDrive
 * @param {Object} options - The options
 *
 * @returns     {Object}  the instance of this class with its options and constants set
 */
var NodeGoogleDrive = function(options) {
  var _this = this;

  this.name = 'Node Google Drive';

  if (!options) {
    options = {};
  }
  _this.options = options;
  ROOT_FOLDER = _this.options.ROOT_FOLDER = _this.options.ROOT_FOLDER || null;
  _this.options.GOOGLE_AUTH_SCOPE = _this.options.GOOGLE_AUTH_SCOPE || [
    'https://www.googleapis.com/auth/drive'
  ];

  var auth_client = new GoogleAuth();
  console.log({ auth_client });
  var oauth2Client;
  // var jwt_client;

  _this.service = {
    files: null
  };

  /**
   * Sets the authentication service.
   * @private
   * @param      {Object}  google_auth  - google auth type instance. Either Oauth2 or JWT
   * @return     {Object}  service property of this instance, with promisified methods for the files namespace
   */
  var setService = function(google_auth) {
    return Promise.try(function() {
      let service = google.drive({
        version: 'v3',
        auth: google_auth
      });
      return service;
    }).then(function(service) {
      _this.service.files = Promise.promisifyAll(service.files);

      return _this.service;
    });
  };

  var storeOauthToken = function(new_token, token_path) {
    return fs
      .writeFileAsync(token_path, JSON.stringify(new_token, null, 4))
      .then(function() {
        console.log('Token stored to ' + token_path);
        return new_token;
      });
  };

  var renewOauthToken = function(google_auth, token_path) {
    return Promise.try(function() {
      google_auth
        .refreshAccessToken(function(err, new_token) {
          return storeOauthToken(new_token, token_path);
        })
        .then(function(new_token) {
          google_auth.credentials = new_token;
          debug('new token expiry date', new_token.expiry_date);
          return setService(google_auth);
        });
    });
  };

  /**
   * Get and store new token after prompting for user authorization, and then execute the given callback with the
   * authorized OAuth2 client.
   * @private
   *
   * @param  {google.auth.OAuth2}  google_auth  The OAuth2 client to get token for
   * @param  {string}              token_path   The token path
   * @return {Promise<Object>}     The service property of this instance
   */
  var getNewOauthToken = function(google_auth, token_path) {
    return Promise.try(function() {
      var authUrl = google_auth.generateAuthUrl({
        access_type: 'offline',
        scope: _this.options.GOOGLE_AUTH_SCOPE
      });
      console.log('Authorize this app by visiting this url: ', authUrl);
      var rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      rl.question('Enter the code from that page here: ', function(code) {
        rl.close();
        google_auth
          .getToken(code, function(err, new_token) {
            google_auth.credentials = new_token;
            return storeOauthToken(new_token, token_path);
          })
          .then(function() {
            return setService(google_auth);
          });
      });
    });
  };

  /**
   * Create an OAuth2 client with the given credentials, and then execute the given callback function.
   * @private
   *
   * @param  {Object}   credentials  The authorization client credentials.
   * @param  {string}   token_path   the path to store the client token
   * @return {Promise}  a promise that unfolds to a new auth token
   */
  var authorizeClientSecret = function(credentials, token_path) {
    var clientSecret = credentials.installed.client_secret;
    var clientId = credentials.installed.client_id;
    var redirectUrl = credentials.installed.redirect_uris[0];
    debug({ auth_client });
    var google_auth = new auth_client.OAuth2(
      clientId,
      clientSecret,
      redirectUrl
    );

    // Check if we have previously stored a token.
    return fs
      .readFileAsync(token_path)
      .then(function(token) {
        google_auth.credentials = JSON.parse(token);

        return renewOauthToken(google_auth, token_path);
      })
      .catch(function(err) {
        debug(err);
        return getNewOauthToken(google_auth, token_path);
      });
  };

  var renewJwtAuth = function(google_auth) {
    return new Promise(function(resolve, reject) {
      google_auth.authorize(function(err, token) {
        if (err) {
          reject(err);
        }
        resolve(setService(google_auth));
      });
    });
  };

  // Request an auth token using a client secret json file
  _this.requestAuthToken = function(creds, token_path) {
    return Promise.try(function() {
      let credsObj;
      if (typeof creds === 'string') {
        credsObj = require(creds);
      } else if (typeof creds === 'object') {
        credsObj = creds;
      }
      return credsObj;
    }).then(function() {
      return authorizeClientSecret(creds, token_path);
    });
  };

  // Use a service account
  _this.useServiceAccountAuth = function(creds) {
    debug('trying to use service account');
    return Promise.try(function() {
      let credsObj;

      if (typeof creds === 'string') {
        credsObj = require(creds);
      } else if (typeof creds === 'object') {
        credsObj = creds;
      }
      return credsObj;
    }).then(function(credsObj) {
      let google_auth = new auth_client.JWT(
        credsObj.client_email,
        null,
        credsObj.private_key,
        _this.options.GOOGLE_AUTH_SCOPE,
        null
      );
      return renewJwtAuth(google_auth);
    });
  };

  // Use an existing auth token
  _this.useAuthToken = function(token, cb) {};

  _this.isAuthActive = function(google_auth) {
    return !!google_auth;
  };

  return _this;
};

/**
 * List files or folders according to passes options object
 *
 *
 * @param  {files/list#request}            [options={}]                              An options object
 * @param  {string|null}                   [options.fileId=ROOT_FOLDER]              The parent folder identifier,defaults
 *                                                                                to ROOT_FOLDER
 * @param  {string|null}                   [options.pageToken=null]                  The page token when pagination is due
 * @param  {boolean}                       [options.recursive=false]                 If false, search only direct children
 *                                                                                of passed parent folder
 * @param  {boolean}                       [options.includeRemoved=false]            include removed files
 * @param  {string}                        [options.fields='nextPageToken,files(id,  name, parents, mimeType,
 *                                                                                modifiedTime)'] fields to include in
 *                                                                                the request The fields
 * @param  {files/list#search-parameters}  [options.q='()']                          query string to filter results.
 * @param  {string}                        [options.orderBy=null]                    Optinally sort results by a given field
 * @param  {string}                        [options.spaces='drive']                  The spaces (drive, photos, appData)
 * @param  {number}                        [options.pageSize=100]                    The page size (max 1000)
 * @param  {boolean}                       [options.supportsTeamDrives=false]        Wether it supports team drives
 * @param  {string}                        [options.teamDriveId='']                  The team drive identifier
 *
 * @return {Promise<files/list#response>}  List of files and or folders resulting from the request
 */
NodeGoogleDrive.prototype.list = async function({
  fileId = ROOT_FOLDER,
  pageToken = null,
  recursive = false,
  includeRemoved = false,
  fields = 'nextPageToken, files(id, name, parents, mimeType, modifiedTime)',
  q = '()',
  orderBy = null,
  spaces = 'drive',
  pageSize = 100,
  supportsTeamDrives = false,
  teamDriveId = ''
} = {}) {
  q += recursive === false ? `AND ('${fileId}' in parents)` : '';

  //console.log({q});
  let request = {
    fileId,
    pageToken,
    recursive,
    includeRemoved,
    fields,
    q,
    spaces,
    pageSize,
    supportsTeamDrives,
    teamDriveId
  };

  return this.service.files
    .listAsync(request)
    .then(function(response) {
      debug('Found %s elements', response.files.length);
      response.parentFolder = fileId;
      return response;
    })
    .catch(function(err) {
      debug('Error listing files ', err.message);
      throw err;
    });
};
/**
 * List files (optionally, start from the specified folder, if set)
 * @see https://developers.google.com/drive/v3/reference/files/list
 * @see https://developers.google.com/drive/v3/reference/files#resource
 * @see https://developers.google.com/drive/api/v3/search-files#file_fields
 *
 * @param  {string}                              parentFolder    - id of the folder from which to search. Defaults to
 *                                                               the ROOT_FOLDER passed in the options
 * @param  {string}                              pageToken       - the page token of a previous request, when the prior
 *                                                               result is paginated
 * @param  {string}                              recursive       - wether to list also files in subfolders of the
 *                                                               requested parentFolder. defaults to true. If false,
 *                                                               omits the files under subfolders. Works only when
 *                                                               parentFolder is explicitly set
 * @param  {boolean}                             includeRemoved  Either to include removed files in the listing.
 *                                                               Defaults to false
 * @param  {string}                              fields          - the partial fields that should be selected
 *
 * @return {Array<google.drive.files#resource>}  array of file resources results
 */
NodeGoogleDrive.prototype.listFiles = async function(
  parentFolder,
  pageToken,
  recursive,
  includeRemoved,
  fields
) {
  return await this.list({
    fileId: parentFolder,
    pageToken,
    recursive,
    includeRemoved,
    fields,
    q: ` (mimeType!='application/vnd.google-apps.folder') `
  });
};

/**
 * List folders (optionally, start from the specified folder, if set)
 * @see https://developers.google.com/drive/v3/reference/files/list
 * @see https://developers.google.com/drive/v3/reference/files#resource
 *
 * @param  {string}   parentFolder    - id of the folder from which to search. Defaults to the ROOT_FOLDER passed in the
 *                                    options
 * @param  {string}   pageToken       - the page token of a previous request, when the prior result is paginated
 * @param  {string}   recursive       - wether to list also files in subfolders of the requested parentFolder. defaults
 *                                    to true. If false, omits the files under subfolders. Works only when parentFolder
 *                                    is explicitly set
 * @param  {boolean}  includeRemoved  - either to list removed folders or not
 * @param  {string}   fields          - the partial fields that should be selected
 *
 * @return {Array<google.drive.files#resource>}  array of folder resources results
 */
NodeGoogleDrive.prototype.listFolders = async function(
  parentFolder,
  pageToken,
  recursive,
  includeRemoved,
  fields
) {
  let { files } = await this.list({
    fileId: parentFolder,
    pageToken,
    recursive,
    includeRemoved,
    fields,
    q: ` (mimeType='application/vnd.google-apps.folder') `
  });
  return { folders: files, parentFolder };
};

/**
 * Exports a google apps file and pipe its body to the desired destination
 * @https://developers.google.com/drive/api/v3/reference/files/export
 *
 * @param  {google.drive.files#resource}  file               A file resource with id, name and type
 * @param  {string}                       destinationFolder  The destination folder to download to (use absolute paths
 *                                                           to avoid surprises)
 * @param  {Object}                       mimeOptions        An object containing the extension and mimetype of the
 *                                                           desired export format. If not set, it will take the default
 *                                                           according to the file mimeType
 * @param  {String}                       fileName           The file name **without extension** (the extension must be
 *                                                           passed in the mimeOptions argument) Defaults to the file
 *                                                           resource's name
 * @return {Promise}                      A promise that resolves when the file is downloaded
 */
NodeGoogleDrive.prototype.exportFile = function(
  file,
  destinationFolder,
  mimeOptions,
  fileName
) {
  let _this = this;

  let { extension, mimeType } = mimeOptions ||
      defaultExportFormats[file.mimeType] || {
        extension: 'pdf',
        mimeType: 'application/pdf'
      },
    request = {
      fileId: file.id,
      mimeType: mimeType
    },
    destination = `${destinationFolder || '/tmp'}/${file.name}.${extension}`,
    dest = fs.createWriteStream(destination);

  return new Promise((resolve, reject) => {
    _this.service.files
      .export(request)
      .on('end', function() {
        resolve(destination);
      })
      .on('error', function(err) {
        reject(err);
      })
      .pipe(dest);
  });
};

/**
 * Gets a file and pipe its body to the desired destination (it only works for non google-docs types)
 *
 * @param  {google.drive.files#resource}  file               A file resource with id, name and type
 * @param  {string}                       destinationFolder  The destination folder to download to (use absolute paths
 *                                                           to avoid surprises)
 * @param  {string}                       fileName           (optional) The file name. Defaults to the file resource's name
 * @return {Promise}                      A promise that resolves when the file is downloaded
 */
NodeGoogleDrive.prototype.getFile = function(
  file,
  destinationFolder,
  fileName
) {
  if (file.mimeType.indexOf('vnd.google-apps') !== -1) {
    return this.exportFile(
      file,
      destinationFolder,
      defaultExportFormats[file.mimeType],
      fileName
    );
  }
  let _this = this,
    request = {
      fileId: file.id,
      alt: 'media'
    },
    destination = `${destinationFolder || '/tmp'}/${file.name}`,
    dest = fs.createWriteStream(destination);

  return new Promise((resolve, reject) => {
    _this.service.files
      .get(request)
      .on('end', function() {
        resolve(destination);
      })
      .on('error', function(err) {
        reject(err);
      })
      .pipe(dest);
  });
};

NodeGoogleDrive.prototype.removeFile = function(fileId) {
  return this.service.files.deleteAsync({
    fileId: fileId,
    resource: {
      fileId: fileId
    }
  });
};

/**
 * Writes a PDF File POC to use `create` method
 *
 * @param  {string}           sourcefile             - The source file from which to read the content of the PDF File to
 *                                                   upload
 * @param  {string}           [parentFolder]         - The parent folder on which to write. Defaults to the ROOT_FOLDER
 *                                                   passed in the constructor options
 * @param  {string}           [destinationFilename]  - The destination filename
 * @return {Promise<Object>}  the response from google drive
 */
NodeGoogleDrive.prototype.writePDFFile = async function(
  sourcefile,
  parentFolder,
  destinationFilename
) {
  let exists = await fs.existsAsync(sourcefile);
  if (!exists) {
    throw new Error(`sourcefile ${sourcefile} not found`);
  }
  return this.create({
    source: sourcefile,
    parentFolder,
    name: destinationFilename,
    mimeType: 'application/pdf'
  });
};

/**
 * @deprecated. Use NodeGoogleDrive.prototype.create instead
 *
 * @param  {string}           source             - The source file from which to read the contents of the file to
 *                                                   upload
 * @param  {string}           [parentFolder]         - The parent folder on which to write. Defaults to the ROOT_FOLDER
 *                                                   passed in the constructor options
 * @param  {string}           [destinationFilename]  - The destination filename, defaults to the basename of the
 *                                                   uploaded file
 * @param  {string}           [mimeType]             - The file's mime type. If not provided, Google Drive will guess it
 * @return {Promise<Object>}  the response from google drive
 */
NodeGoogleDrive.prototype.create = async function({
  source = 'some file',
  parentFolder = ROOT_FOLDER,
  name = null,
  mimeType = null
}) {
  let media = { mimeType },
    exists = fs.existsSync(source);

  if (exists) {
    name = name || path.basename(source);
    media.body = fs.createReadStream(source);
  } else {
    media.body = source;
    name = name || 'New File' + Date.now();
  }

  let creationRequest = {
    resource: {
      name,
      mimeType,
      parents: [parentFolder]
    },
    media
  };

  return this.service.files
    .createAsync(creationRequest)
    .then(function(response) {
      debug('Wrote file to Google Drive', response);
      return response;
    })
    .catch(function(err) {
      debug('The API returned an error: ', err.message);
      throw err;
    });
};

/**
 * @deprecated. Use NodeGoogleDrive.prototype.create instead
 *
 * @param  {string}           source             - The source file from which to read the contents of the file to
 *                                                   upload
 * @param  {string}           [parentFolder]         - The parent folder on which to write. Defaults to the ROOT_FOLDER
 *                                                   passed in the constructor options
 * @param  {string}           [destinationFilename]  - The destination filename, defaults to the basename of the
 *                                                   uploaded file
 * @param  {string}           [mimeType]             - The file's mime type. If not provided, Google Drive will guess it
 * @return {Promise<Object>}  the response from google drive
 */
NodeGoogleDrive.prototype.writeFile = async function(
  source,
  parentFolder,
  destinationFilename,
  mimeType
) {
  return this.create({
    source,
    parentFolder,
    name: destinationFilename,
    mimeType
  });
};
/**
 * @deprecated. Use NodeGoogleDrive.prototype.create instead
 *
 * @param  {string}           content                - The content of the text file
 * @param  {string}           [parentFolder]         - The parent folder on which to write. Defaults to the ROOT_FOLDER
 *                                                   passed in the constructor options
 * @param  {string}           [destinationFilename]  - The destination filename
 * @return {Promise<Object>}  the response from google drive
 */
NodeGoogleDrive.prototype.writeTextFile = function(
  content,
  parentFolder,
  destinationFilename
) {
  return this.create({
    source: content,
    parentFolder,
    destinationFilename: destinationFilename || 'Text_file_' + Date.now(),
    mimeType: 'text/plain'
  });
};

/**
 * Creates a folder in Google Drive
 *
 * @param  {string}           [parentFolder]  - The parent folder on which to write. Defaults to the ROOT_FOLDER passed
 *                                            in the constructor options
 * @param  {string}           [folderName]    - The name of the folder that will be created
 * @return {Promise<Object>}  the response from google drive
 */
NodeGoogleDrive.prototype.createFolder = function(parentFolder, folderName) {
  return this.create({
    parentFolder,
    name: folderName || 'Generic Folder',
    mimeType: 'application/vnd.google-apps.folder'
  });
};

module.exports = NodeGoogleDrive;
