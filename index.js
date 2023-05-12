const fs = require('fs');
const request = require('request-promise-native');
const moment = require('moment-timezone');
const AWS = require('aws-sdk');

// Configure the AWS SDK
AWS.config.update({
  maxRetries: 2,
  httpOptions: {
    timeout: 3000,
    connectTimeout: 2000
  },
  region: 'us-west-2'
});

// Set up the AWS SDK
const s3 = new AWS.S3();
const s3_name = "suiteview-storage";
const isapi_url = "ISAPI/Streaming/channels/1/picture?snapShotImageType=JPEG&videoResolutionWidth=1280&videoResolutionHeight=720";

exports.handler = async (event) => {
  try {
    console.log(event);
    
    // Get the allowed camera IDs from the event pattern
    const allowedCameras = event.detail.allowed_cameras;
    
    // Fetch camera details from DynamoDB for the specified camera IDs
    const dynamodb = new AWS.DynamoDB();
    const cameras = [];
    for (const cameraId of allowedCameras) {
      const dynamodbParams = {
        TableName: 'ip_camera_details',
        FilterExpression: 'id = :id',
        ExpressionAttributeValues: {
          ':id': { S: cameraId.toString() }
        }
      };
      const data = await dynamodb.scan(dynamodbParams).promise();
      if (data.Items.length === 0) {
        console.log(`No camera details found for Camera Id # ${cameraId}`);
      } else {
        const item = data.Items[0];
        const id = item.id.S;
        const ip = item.ip.S;
        const username = item.USERNAME.S;
        const password = item.PASSWORD.S;
        const camera_name = item.camera_name.S;
        cameras.push({ id, ip, username, password, camera_name });
      }
    }
    
    // Download and upload images for the specified cameras
    for (const camera of cameras) {
      const { id, ip, username, password, camera_name } = camera;
      const s3RootFolder = `${camera_name}`;
      const imageUrl = `http://${ip}/${isapi_url}`;

      // Print the URL and camera ID
      console.log(`Downloading image from camera ${s3RootFolder} (${imageUrl})`);
      
      // Decrypt the password
      const decodedpass = Buffer.from(password, 'base64').toString('ascii');

      
      // Send a GET request with digest authentication to download the image
      const body = await request.get(imageUrl, { auth: { user: username, pass: decodedpass, sendImmediately: false }, encoding: 'binary' });
      
      
      if (body.length === 0) {
        console.log(`No image found for camera ${s3RootFolder}`);
        continue; // skip to the next camera
      }
      
      // Generate a timestamp-based filename
      const now = moment().tz('Asia/Manila');
      const timestamp = now.format('YYYY-MM-DD-HH-mm-ss');
      const filename = `${s3RootFolder}_${timestamp}.jpg`;

      // Save the image to a local file
      const localFilePath = `/tmp/${filename}`;
      await new Promise((resolve, reject) => {
        fs.writeFile(localFilePath, body, 'binary', (err) => {
          if (err) {
            reject(`Failed to save the image to local file: ${err}`);
          } else {
            resolve();
          }
        });
      });

      console.log(`Image saved to ${localFilePath}`);

      // Upload the image to S3
const s3Key = `${s3RootFolder}/Images/${now.format('YYYY-MM-DD')}/${filename}`;
      const s3Params = {
        Bucket: s3_name, 
        Key: s3Key,
        Body: fs.readFileSync(localFilePath),
        ContentType: 'image/jpeg',
        Tagging: `camera=${s3RootFolder}`
      };
      await s3.upload(s3Params).promise();

      console.log(`Image uploaded to S3 with key ${s3Key}`);

      // Delete the local file
      fs.unlink(localFilePath, (err) => {
        if (err) {
          console.error(`Failed to delete local file ${localFilePath}: ${err}`);
        } else {
          console.log(`Local file ${localFilePath} deleted`);
        }
      });
    }
    
  } catch (error) {
    console.error(`Failed to download or upload image: ${error}`);
  }
}





// const fs = require('fs');
// const request = require('request-promise-native');
// const moment = require('moment-timezone');
// const AWS = require('aws-sdk');

// // Configure the AWS SDK
// AWS.config.update({
//   maxRetries: 2,
//   httpOptions: {
//     timeout: 3000,
//     connectTimeout: 2000
//   },
//   region: 'us-west-2'
// });

// // Set up the AWS SDK
// const s3 = new AWS.S3();
// const s3_name = "suiteview-storage";
// const isapi_url = "ISAPI/Streaming/channels/1/picture?snapShotImageType=JPEG&videoResolutionWidth=1280&videoResolutionHeight=720";

// const main = async (event) => {
//   try {
//     // Fetch camera details from DynamoDB
//     const dynamodb = new AWS.DynamoDB();
//     const dynamodbParams = {
//       TableName: 'ip_camera_details'
//     };
//     const data = await dynamodb.scan(dynamodbParams).promise();
//     const cameras = data.Items.map(item => {
//       const id = item.id.S;
//       const ip = item.ip.S;
//       const username = item.USERNAME.S;
//       const password = item.PASSWORD.S;
//       return { id, ip, username, password };
//     });
    
//     // Download and upload images for each camera
//     for (const camera of cameras) {
//       const { id, ip, username, password } = camera;
//       const s3RootFolder = `ip_camera_${id}`;
//       const imageUrl = `http://${ip}/${isapi_url}`;

//       // Print the URL and camera ID
//       console.log(`Downloading image from camera ${s3RootFolder} (${imageUrl})`);
      
//       // Decrypt the password
//       const decodedpass = Buffer.from(password, 'base64').toString('ascii');

      
//       // Send a GET request with digest authentication to download the image
//       const body = await request.get(imageUrl, { auth: { user: username, pass: decodedpass, sendImmediately: false }, encoding: 'binary' });
      
      
//       if (body.length === 0) {
//         console.log(`No image found for camera ${s3RootFolder}`);
//         continue; // skip to the next camera
//       }
      
//       // Generate a timestamp-based filename
//       const now = moment().tz('Asia/Manila');
//       const timestamp = now.format('YYYY-MM-DD-HH-mm-ss');
//       const filename = `${s3RootFolder}_${timestamp}.jpg`;

//       // Save the image to a local file
//       const localFilePath = `/tmp/${filename}`;
//       await new Promise((resolve, reject) => {
//         fs.writeFile(localFilePath, body, 'binary', (err) => {
//           if (err) {
//             reject(`Failed to save the image to local file: ${err}`);
//           } else {
//             resolve();
//           }
//         });
//       });

//       console.log(`Image saved to ${localFilePath}`);

//       // Upload the image to S3
//       const s3Key = `${s3RootFolder}/Images/${now.format('YYYY-MM-DD')}/${filename}`;
//       const s3Params = {
//         Bucket: s3_name, 
//         Key: s3Key,
//         Body: fs.readFileSync(localFilePath),
//         ContentType: 'image/jpeg',
//         Tagging: `camera=${s3RootFolder}`
//       };
//       await s3.upload(s3Params).promise();

//       console.log(`Image uploaded to S3 with key ${s3Key}`);

//       // Delete the local file
//       fs.unlink(localFilePath, (err) => {
//         if (err) {
//           console.error(`Failed to delete local file ${localFilePath}: ${err}`);
//         } else {
//           console.log(`Local file ${localFilePath} deleted`);
//         }
//       });
//     }
    
//   } catch (error) {
//     console.error(`Failed to download or upload image: ${error}`);
//   }
// }
// exports.handler = main;