import { EventEmitter } from 'events';
import AWS from 'aws-sdk';

// These account numbers are pre-configured and will change based on any new AWS accounts that are created
// Control may need to be added here in future.
const ENVIRONMENT_MAP = {
  kaos: '384553929753',
  prod: '966972755541'
};

/**
 * Service class for interacting with NIB SQS queue implementations
 */
export default class QueueService {

  /**
   * Creates our SQS queue with smart defaults and configured queue URL
   * The queue will pre-exist and should be created using the convention of:
   * - {appName}-{slice}-{queueName}
   * @param {string} appName the name of the application
   * @param {string} slice the slice of the application
   * @param {string} environment the environment in which the queue lives. The environment should be either `kaos` or `prod`.
   *                             All other values default to `kaos`.
   * @param {string} queueName the name of the queue that exists within SQS
   */
  constructor(appName, slice, environment, queueName) {
    if (!appName || !slice || !environment || !queueName) {
      throw new Error('All parameters are mandatory, please provide an appName, slice, environment and queueName');
    }
    // for example `alfred-ons-123-work-items`
    const uri = `${appName}-${slice}-${queueName}`;
    let account = ENVIRONMENT_MAP[environment];
    if (!account) {
      account = ENVIRONMENT_MAP.kaos;
    }

    this.url = `https://sqs.ap-southeast-2.amazonaws.com/${account}/${uri}`;
    this.poll = null;

    this.sqs = new AWS.SQS({
      region: 'ap-southeast-2', // this is our default region
      apiVersion: '2012-11-05', // lock down our API version
      params: {
        QueueUrl: this.url // bind QueueURL for following methods
      }
    });
  }

  /**
   * Sends a mesage to the configured SQS Queue
   * @param {object} a message to be send to the queue
   * @returns {Promise} returns a promise whether the message was successfully delivered
   */
  sendMessage(message) {
    return new Promise((resolve, reject) => {
      this.sqs.sendMessage({
        MessageBody: JSON.stringify(message)
      }, (err, data) => {
        if (err) return reject(`An error occurred: ${err}`);
        return resolve(data);
      });
    });
  }

  /**
   * Reads a message from the queue using long polling for default wait time of 20 seconds.
   * The message is not removed from the queue
   * @param {integer} maxNumberOfMessages the max number of messages to read from the queue
   * @returns {Promise} a promise whether the API succeeded or failed
   */
  receiveMessage(maxNumberOfMessages = 1) {
    return new Promise((resolve, reject) => {
      this.sqs.receiveMessage({
        MaxNumberOfMessages: maxNumberOfMessages,
        AttributeNames: ['All'],
        WaitTimeSeconds: 10
      }, (err, data) => {
        if (err) return reject(`An error occurred: ${err}`);
        return resolve(data);
      });
    });
  }

  /**
   * Deletes a message from the queue.
   * @param {string} message the message to delete from queue. Must be a message from AWS SDK with a ReceiptHandle prop
   *                         @see http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SQS.html#deleteMessage-property
   * @returns {Promise} a promise whether the API succeeded or failed
   */
  deleteMessage(message) {
    return new Promise((resolve, reject) => {
      if (!message.ReceiptHandle) {
        return reject('message input did not contain a receipt handle');
      }
      const deleteParams = {
        ReceiptHandle: message.ReceiptHandle
      };
      return this.sqs.deleteMessage(deleteParams, (err, data) => {
        if (err) return reject(`An error occurred: ${err}`);
        return resolve(data);
      });
    });
  }

  /**
   * Dequeues a message from the queue.
   * @returns {Promise} a promise containing the message that was deleted
   */
  async dequeue() {
    const data = await this.receiveMessage();
    await this.deleteMessage(data);
    return data;
  }

  /**
   * !!! CAUTION !!!
   * Purges the queue clean. This should be done with caution! This cannot be undone and can only occur once every
   * minute
   **/
  purgeQueue() {
    return new Promise((resolve, reject) => {
      this.sqs.purgeQueue((err, data) => {
        if (err) return reject(`An error occurred: ${err}`);
        return resolve(data);
      });
    });
  }

  /**
   * Starts long polling for messages. Messages are polled from the queue every interval returns an event emitter for each event.
   * Messages that have errors are not deleted from the queue. Max number of messages received per poll is 10
   * @param {integer} intervalSeconds the interval over which we retry the long poll, must be greater than 20 seconds
   * @returns {object} returns an EventEmitter consumer object, events include:
   *                           - message: when a message has been dequeued
   *                           - error: something has gone wrong
   */
  startPolling(intervalSeconds) {
    // creates an interval for at least 20 seconds
    const seconds = Math.max(intervalSeconds, 20);
    const interval = seconds * 1000;

    const emitter = new EventEmitter();
    this.poll = setInterval(() => {
      this.receiveMessage(10)
        .then(messages => {
          // long polling will receive zero messages if nothing arrives in the queueName
          // therefore, we check if messages are zero
          if (messages.Messages) {
            emitter.emit('message', messages);
          }
        })
        .catch(err => {
          emitter.emit('error', err);
        });
    }, interval);
    return emitter;
  }

  stopPolling() {
    clearInterval(this.poll);
  }
}