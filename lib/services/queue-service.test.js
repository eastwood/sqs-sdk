import { EventEmitter } from 'events';
import chai from 'chai';
import { expect } from 'chai';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import proxyquire from 'proxyquire';

chai.use(sinonChai);

describe('Queue Service Test', () => {

  const sandbox = sinon.sandbox.create();
  const awsMock = {
    sendMessage: sandbox.stub(),
    receiveMessage: sandbox.stub(),
    deleteMessage: sandbox.stub()
  };

  let options = null;
  const QueueService = proxyquire('./queue-service', {
    'aws-sdk': {
      SQS: function (object) { //eslint-disable-line
        options = object;
        return awsMock;
      }
    }
  }).default;

  beforeEach(() => {
    options = null;
    sandbox.reset();
  });

  describe('Construction', () => {
    it('should throw an error when parameters are not correctly provided to the constructor', done => {
      try {
        const service = new QueueService(); //eslint-disable-line
        return done('should throw an error here');
      } catch (err) {
        expect(err.message).to.eql('All parameters are mandatory, please provide an appName, slice, environment and queueName');
        return done();
      }
    });

    it('should throw an error when parameters are not correctly provided to the constructor', done => {
      try {
        const service = new QueueService('appName', 'slice', 'environment', null); //eslint-disable-line
        return done('should throw an error here');
      } catch (err) {
        expect(err.message).to.eql('All parameters are mandatory, please provide an appName, slice, environment and queueName');
        return done();
      }
    });

    it('should generate a kaos sqs instance when parameters are entered and non-existent environment', () => {
      const service = new QueueService('appName', 'slice', 'environment', 'name'); //eslint-disable-line
      expect(options.params.QueueUrl).to.eql('https://sqs.ap-southeast-2.amazonaws.com/384553929753/appName-slice-name');
    });

    it('should generate a kaos sqs instance when kaos environment is provided', () => {
      const service = new QueueService('appName', 'slice', 'kaos', 'name'); //eslint-disable-line
      expect(options.params.QueueUrl).to.eql('https://sqs.ap-southeast-2.amazonaws.com/384553929753/appName-slice-name');
    });

    it('should generate a prod sqs instance when prod environment is provided', () => {
      const service = new QueueService('appName', 'slice', 'prod', 'name'); //eslint-disable-line
      expect(options.params.QueueUrl).to.eql('https://sqs.ap-southeast-2.amazonaws.com/966972755541/appName-slice-name');
    });

  });

  describe('Send Message', () => {
    it('should put MessageBody on the queue given a message', () => {
      const service = new QueueService('appName', 'slice', 'kaos', 'name'); //eslint-disable-line
      awsMock.sendMessage.yields(false, 'some_data');
      return service.sendMessage('test')
        .then(data => {
          expect(data).to.eql('some_data');
          expect(awsMock.sendMessage).to.have.been.called; // eslint-disable-line
          expect(awsMock.sendMessage.getCall(0).args[0]).to.eql({ MessageBody: JSON.stringify('test') });
        });
    });

    it('should throw an error when SQS rejects', () => {
      const service = new QueueService('appName', 'slice', 'kaos', 'name'); //eslint-disable-line
      awsMock.sendMessage.yields('ERR', 'some_data');
      return service.sendMessage('test')
        .catch(err => {
          expect(err).to.eql('An error occurred: ERR');
        });
    });
  });

  describe('Receive Message', () => {
    it('should return single message from the queue', () => {
      const service = new QueueService('appName', 'slice', 'kaos', 'name'); //eslint-disable-line
      awsMock.receiveMessage.yields(false, 'some_data');
      return service.receiveMessage(10)
        .then(data => {
          expect(data).to.eql('some_data');
          expect(awsMock.receiveMessage).to.have.been.called; // eslint-disable-line
          expect(awsMock.receiveMessage.getCall(0).args[0]).to.eql({ MaxNumberOfMessages: 10, WaitTimeSeconds: 10, AttributeNames: ['All'] });
        });
    });

    it('should throw an error when SQS throws an error', () => {
      const service = new QueueService('appName', 'slice', 'kaos', 'name'); //eslint-disable-line
      awsMock.receiveMessage.yields('ERR', 'some_data');
      return service.receiveMessage('test')
        .catch(err => {
          expect(err).to.eql('An error occurred: ERR');
        });
    });
  });

  describe('Delete Message', () => {
    it('should delete a message based on the receipt handle', () => {
      const service = new QueueService('appName', 'slice', 'kaos', 'name'); //eslint-disable-line
      awsMock.deleteMessage.yields(false, 'some_data');
      return service.deleteMessage({ body: 'test', ReceiptHandle: 123 })
        .then(data => {
          expect(data).to.eql('some_data');
          expect(awsMock.deleteMessage).to.have.been.called; //eslint-disable-line
          expect(awsMock.deleteMessage.getCall(0).args[0]).to.eql({ ReceiptHandle: 123 });
        });
    });

    it('should throw an error when non message is passed', () => {
      const service = new QueueService('appName', 'slice', 'kaos', 'name'); //eslint-disable-line
      awsMock.deleteMessage.yields('ERR', 'some_data');
      return service.deleteMessage('test')
        .catch(err => {
          expect(err).to.eql('message input did not contain a receipt handle');
        });
    });

    it('should throw an error when SDK yields error', () => {
      const service = new QueueService('appName', 'slice', 'kaos', 'name'); //eslint-disable-line
      awsMock.deleteMessage.yields('ERR', 'some_data');
      return service.deleteMessage({ ReceiptHandle: 123 })
        .catch(err => {
          expect(err).to.eql('An error occurred: ERR');
        });
    });
  });

  describe('Dequeue Message', () => {
    it('should dequeue a message from the queue when the message is successfully received', () => {
      const service = new QueueService('appName', 'slice', 'kaos', 'name'); //eslint-disable-line
      const message = { ReceiptHandle: 123 };
      awsMock.receiveMessage.yields(false, message);
      awsMock.deleteMessage.yields(false, 'deleted');
      return service.dequeue()
        .then(out => {
          expect(out).to.eql(message);
          expect(awsMock.deleteMessage.getCall(0).args[0]).to.eql(message);
        });
    });
  });

  describe('Polling', () => {

    it('should return an event emitter upon starting to poll', () => {
      const service = new QueueService('appName', 'slice', 'kaos', 'name'); //eslint-disable-line
      const actual = service.startPolling(10);
      expect(actual).to.be.an.instanceof(EventEmitter);
    });
  });
});