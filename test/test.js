const path = require('path'),
  Promise = require('bluebird'),
  fs = Promise.promisifyAll(require('fs')),
  NodeGoogleDrive = require('../index.js'),
  Config = require('../config/config.js'),
  _ = require('lodash'),
  debug = require('debug')(`node-google-drive:test`);

const ROOT_FOLDER = Config.GOOGLE_DRIVE_ROOT_FOLDER,
  GOOGLE_AUTH_SCOPE = ['https://www.googleapis.com/auth/drive'],
  googleDriveInstance = new NodeGoogleDrive({
    ROOT_FOLDER: ROOT_FOLDER,
    GOOGLE_AUTH_SCOPE: GOOGLE_AUTH_SCOPE
  }),
  service_account_path = path.resolve(
    `${__dirname}/./config/${Config.GOOGLE_DRIVE_KEY_FILE}`
  ),
  creds_service_user = Config.GOOGLE_CREDENTIALS
    ? JSON.parse(Config.GOOGLE_CREDENTIALS)
    : require(service_account_path);

let temp_folder;

googleDriveInstance
  .useServiceAccountAuth(creds_service_user)
  .then(function(gdrivehandler) {
    return googleDriveInstance.createFolder(
      ROOT_FOLDER,
      `test_folder_${Date.now()}`
    );
  })
  .then(function(createFolder_result) {
    debug('created Folder', createFolder_result);
    temp_folder = createFolder_result.id;

    return googleDriveInstance.listFolders(temp_folder, null, false);
  })
  .then(subfolders_result => {
    debug('subfolders under previously created folder', subfolders_result);
    const sourcefile = path.resolve(`${__dirname}/../data/sample.pdf`);

    return googleDriveInstance.writeFile(sourcefile, temp_folder);
  })
  .then(writeFile_result => {
    debug('writeFile result', writeFile_result);
  })
  .catch(err => {
    debug('Error!', err);
  });
