import 'babel-polyfill';

import chai from 'chai';
import { expect } from 'chai';
import sinon from 'sinon';
import chaiAsPromised from 'chai-as-promised';
import sinonChai from 'sinon-chai';

chai.use(sinonChai);
chai.use(chaiAsPromised);

global.expect = expect;
global.sinon = sinon;
