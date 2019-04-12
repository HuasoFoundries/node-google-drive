# node-google-drive

[![Travis CI](https://travis-ci.org/HuasoFoundries/node-google-drive.svg?branch=master)](https://travis-ci.org/HuasoFoundries/node-google-drive)
[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2FHuasoFoundries%2Fnode-google-drive.svg?type=shield)](https://app.fossa.io/projects/git%2Bgithub.com%2FHuasoFoundries%2Fnode-google-drive?ref=badge_shield)

Library to operate with Google Drive API v3 from Node.js, using system user tokens or personal keys

This library is **heavily** inspired on [theozero](https://www.npmjs.com/~theozero)'s' [google-spreadsheet](https://www.npmjs.com/package/google-spreadsheet). No, I mean, really inspired. As in _blatantly copied_. The only difference being his library is to operate with google spreadsheets and this one is to interact with google drive.

So, basically, you can operate in two ways. You either use Google Oauth and manually enter your credentials everytime, or use a Service Account and forget about further authentications.

### How to create a Service Account

(the following is taken from [google-spreadsheet](https://www.npmjs.com/package/google-spreadsheet) docs)

1. Go to the [Google Developers Console](https://console.developers.google.com/project)
2. Select your project or create a new one (and then select it)
3. Enable the Drive API for your project

- In the sidebar on the left, expand **APIs & auth** > **APIs**
- Search for "drive"
- Click on "Drive API"
- click the blue "Enable API" button

4. Create a service account for your project

- In the sidebar on the left, expand **APIs & auth** > **Credentials**
- Click blue "Add credentials" button
- Select the "Service account" option
- Select "Furnish a new private key" checkbox
- Select the "JSON" key type option
- Click blue "Create" button
- your JSON key file is generated and downloaded to your machine (**it is the only copy!**)
- note your service account's email address (also available in the JSON key file)

5. Share the doc (or docs) with your service account using the email noted above

### Example usage:

Let's say you stored your user credentials in a file called `my_credentials.json`. And you gave permission to the service account's email address over a folder in your Google Drive whose id is `1bibD4HDZVbqOPq882YSDTmZlI06fZvLU`. So you would do:

```js
const YOUR_ROOT_FOLDER = '1bibD4HDZVbqOPq882YSDTmZlI06fZvLU',
	PATH_TO_CREDENTIALS = path.resolve(`${__dirname}/my_credentials.json`);

// Let's wrap everything in an async function to use await sugar
async function ExampleOperations() {
	const creds_service_user = require(PATH_TO_CREDENTIALS);

	const googleDriveInstance = new NodeGoogleDrive({
		ROOT_FOLDER: YOUR_ROOT_FOLDER
	});

	let gdrive = await googleDriveInstance.useServiceAccountAuth(
		creds_service_user
	);

	// List Folders under the root folder
	let folderResponse = await googleDriveInstance.listFolders(
		YOUR_ROOT_FOLDER,
		null,
		false
	);

	console.log({ folders: folderResponse.folders });

	// Create a folder under your root folder
	let newFolder = { name: 'folder_example' + Date.now() },
		createFolderResponse = await googleDriveInstance.createFolder(
			YOUR_ROOT_FOLDER,
			newFolder.name
		);

	newFolder.id = createFolderResponse.id;

	debug(`Created folder ${newFolder.name} with id ${newFolder.id}`);

	// List files under your root folder.
	let listFilesResponse = await googleDriveInstance.listFiles(
		YOUR_ROOT_FOLDER,
		null,
		false
	);

	for (let file of listFilesResponse.files) {
		debug({ file });
	}
}

ExampleOperations();
```

See [API](API.md) for a description of available methods.

## License

[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2FHuasoFoundries%2Fnode-google-drive.svg?type=large)](https://app.fossa.io/projects/git%2Bgithub.com%2FHuasoFoundries%2Fnode-google-drive?ref=badge_large)
