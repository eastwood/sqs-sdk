import AWS from 'aws-sdk';
import uuid from 'node-uuid';

export default class StorageService {
  constructor(bucketName) {
    this.aws = new AWS.S3({
      params: { Bucket: bucketName },
      signatureVersion: 'v4',
      region: 'ap-southeast-2'
    });
  }


  /**
   * Gets a guaranteed unique Key to upload the attachment
   **/
  getUniqueKey(prefix) {
    const key = prefix + uuid.v1();
    return new Promise((resolve, reject) => {
      this.aws.headObject({ Key: key }, err => {
        if (err) {
          if (err.code === 'NotFound') {
            resolve(key);
          } else {
            reject(err);
          }
        } else {
          this.getUniqueKey(prefix)
            .then(resolve)
            .catch(reject);
        }
      });
    });
  }

  /**
   * Takes a base64 encoded string attachment and stores it in S3.
   * Returns an identifier for where to reference this later
   * @param {string} attachments the attachments array of base 64 encoded files
   * @param {string} prefix the prefix to use as the key name, usually the email we're sending too.
   * @returns {Promise} an identifier or reference for the newly created file
   **/
  async putAttachment(prefix, attachments) {
    try {
      const key = await this.getUniqueKey(prefix);
      const putData = {
        Key: key,
        Body: JSON.stringify(attachments)
      };
      return await this.putObjectPromise(putData);
    } catch (err) {
      console.log('An error was thrown putting object on S3', err);
      throw err;
    }
  }

  putObjectPromise(data) {
    return new Promise((resolve, reject) => {
      this.aws.putObject(data, err => {
        if (err) return reject(err);
        return resolve(data.Key);
      });
    });
  }
}