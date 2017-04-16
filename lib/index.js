import StorageService from './services/storage-service';

export default class Provider {

  constructor(bucketName) {
    this.storageService = new StorageService(bucketName);
  }



}