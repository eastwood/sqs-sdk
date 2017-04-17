import proxyquire from 'proxyquire';

// Sandbox & Mocks
const sandbox = sinon.sandbox.create();

const headMock = sandbox.stub();
const getMock = sandbox.stub();
const putMock = sandbox.stub();
const deleteMock = sandbox.stub();
const uuidMock = sandbox.stub();

class S3ClassMock {
  constructor(o) {
    this.options = o;
    this.headObject = headMock;
    this.getObject = getMock;
    this.putObject = putMock;
    this.deleteObject = deleteMock;
  }
}

const StorageService = proxyquire('./storage-service', {
  'aws-sdk': { S3: S3ClassMock },
  'uuid': { v1: uuidMock }
}).default;

describe('Storage Service Test', () => {
  beforeEach(() => {
    sandbox.reset();
  });

  it('should construct a S3 service with given bucket name', () => {
    const storageService = new StorageService('bucket_name', 'ap-southeast-2'); //eslint-disable-line
    expect(storageService.aws.options).to.eql({
      params: { Bucket: 'bucket_name' },
      signatureVersion: 'v4',
      region: 'ap-southeast-2'
    });
  });

  describe('Unique key', () => {
    it('should generate a prefixed uuid key', () => {
      const storageService = new StorageService('bucket_name'); //eslint-disable-line

      // head mock returns NotFound error, which is good
      headMock.yields({ code: 'NotFound' });
      uuidMock.returns('some-guid');
      return expect(storageService.getUniqueKey('prefix')).to.be.fulfilled
        .then(result => {
          expect(result).to.eql('prefixsome-guid');
        });
    });

    it('should throw when S3 returns an error other than "NotFound"', () => {
      const storageService = new StorageService('bucket_name'); //eslint-disable-line

      headMock.yields({ code: 'BadError' });
      return expect(storageService.getUniqueKey('prefix')).to.be.rejected
        .then(err => {
          expect(err).to.eql({ code: 'BadError' });
        });
    });

    it('should generate another key if the key is already found', () => {
      const storageService = new StorageService('bucket_name'); //eslint-disable-line

      // no error found, generate another key
      headMock.onFirstCall().yields(null);
      // this works the second time
      headMock.onSecondCall().yields({ code: 'NotFound' });
      uuidMock.onFirstCall().returns('some-guid-x');
      uuidMock.onSecondCall().returns('some-guid-y');

      return expect(storageService.getUniqueKey('prefix')).to.be.fulfilled
        .then(result => {
          expect(result).to.eql('prefixsome-guid-y');
        });
    });

  });

  describe('Put Attachments', () => {
    it('should resolve and put object on queue when the key does not exist', () => {
      const storageService = new StorageService('bucket_name'); //eslint-disable-line
      const attachments = {
        one: 'foo'
      };

      uuidMock.onFirstCall().returns('some-guid');
      headMock.onFirstCall().yields({ code: 'NotFound' });
      putMock.onFirstCall().yields(null);
      return storageService.putAttachment('prefix', attachments)
        .then(params => {
          expect(params).to.eql('prefixsome-guid');
        });
    });

    it('should reject when putObject fails', () => {
      const storageService = new StorageService('bucket_name'); //eslint-disable-line
      const attachments = {
        one: 'foo'
      };

      uuidMock.onFirstCall().returns('some-guid');
      headMock.onFirstCall().yields({ code: 'NotFound' });
      putMock.onFirstCall().yields('exterminate...exterminate');
      return storageService.putAttachment('prefix', attachments)
        .then(() => {
          throw new Error('this should never throw an error');
        })
        .catch(err => {
          expect(err).to.eql('exterminate...exterminate');
        });
    });
  });
});
