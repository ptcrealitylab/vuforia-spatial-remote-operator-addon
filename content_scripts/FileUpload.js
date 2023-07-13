createNameSpace('realityEditor.network');

(function(exports) {
    class FileUpload {
        constructor() {
            console.log('created new FileUploader');
        }
        setServerPath(serverIp, serverPort, objectId) {
            this.serverIp = serverIp;
            this.serverPort = serverPort;
            this.objectId = objectId;
            
            console.log('set FileUpload server path', serverIp, serverPort, objectId);
        }
        uploadFilesToServer(files, callback) {
            if (!this.serverIp) return;
            if (!this.serverPort) return;
            if (!this.objectId) return;

            // Create a new FormData object.
            let formData = new FormData();

            // let isVideo = false;

            // Loop through each of the selected files.
            for (let i = 0; i < files.length; i++) {
                let file = files[i];

                // // Check the file type.
                // if (!file.type.match('image.*') && !file.type.match('video.*')) {
                //     continue;
                // }
                //
                // if (file.type.match('video.*')) {
                //     isVideo = true;
                // }

                // Add the file to the request.
                formData.append('file', file, file.name);
            }

            // Set up the request.
            let xhr = new XMLHttpRequest();

            let postUrl = 'http://' + this.serverIp + ':' + this.serverPort + '/object/' + this.objectId + '/uploadMediaFile';

            // Open the connection.
            xhr.open('POST', postUrl, true);

            // Set up a handler for when the request finishes.
            xhr.onload = () => {
                if (xhr.status !== 200) {
                    console.log('error uploading');
                    return;
                }
                // File(s) uploaded.
                console.log('successful upload');
                let mediaUuid = JSON.parse(xhr.responseText).mediaUuid;
                // let extension = isVideo ? '.mov' : '.jpg';
                // let filepath = 'http://' + this.serverIp + ':' + this.serverPort + '/mediaFile/' + this.objectId + '/' + mediaUuid + extension;
                let filepath = 'http://' + this.serverIp + ':' + this.serverPort + '/mediaFile/' + this.objectId + '/' + mediaUuid;
                callback(filepath);
            };

            // Send the Data.
            xhr.send(formData);
        }
    }

    exports.FileUpload = FileUpload;
})(realityEditor.network);


