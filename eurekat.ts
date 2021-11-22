/**
 * Eure-Kat - a Netflix Eureka Developer utility.
 * 
 * @author Dave Krause 
 * @link https://github.com/d-krause/eurekat
 * 
 * Eure-Kat utility can be used to import a eureka environment into your localhost eureka environment
 * without the need to register your locally hosted micros in the service discovery pool.  This
 * allows developers to work on just 1 or 2 microservices locally while using their dependent
 * microservices from the main environment pool.
 **/
const rpz = require('request-promise');
const xml2js = require('xml2js');
const builder = new xml2js.Builder({ attrkey: '@', rootName: 'instance', headless: true });
const yargs = require('yargs/yargs');

const eurekaEnvironments = {
  'local': 'http://localhost:8761',
  'QA1': 'http://myqa1-eureka-server:1761',
  'QA2': 'http://myqa2-eureka-server:1761'
};

const getEurekaApps = async (env, verbose = false) => {
  const data = await rpz({
    method: 'GET',
    uri: `${eurekaEnvironments[env]}/eureka/apps/`,
    headers: { 'Accept': 'application/json' },
    json: true
  });
  return data;
}

const postEurekaApp = (env, name, appXml, verbose = false) => {
  if (verbose) console.log(`Posting ${name} to ${env} with ${appXml}`);
  return rpz({
    method: 'POST',
    uri: `${eurekaEnvironments[env]}/eureka/apps/${name}`,
    headers: { 'Content-type': 'application/xml' },
    body: appXml,
    json: false
  });
}

const deleteEurekaApp = (env, name, instanceId, verbose = false) => {
  if (verbose) console.log(`Deleting ${instanceId} from ${env}`);
  return rpz({
    method: 'DELETE',
    uri: `${eurekaEnvironments[env]}/eureka/apps/${name}/${instanceId}`,
    headers: { 'Content-type': 'application/xml' },
    json: false
  });
}

const deleteLocalEureka = (env, excludeApps = [], verbose = false) => {
  getEurekaApps('local', verbose).then(data => {
    const eurekaApps = data;
    const appList = eurekaApps.applications.application;
    appList.filter(x => !excludeApps.includes(x.name)).forEach(app => {
      app.instance.forEach(instance => {
        deleteEurekaApp('local', app.name, instance.instanceId, verbose).then(response => {
          console.log(`Deleted ${app.name} from local eureka.`);
        });
      });
    });
  });
};

const updateLocalEureka = (env, excludeApps = [], verbose = false) => {

  getEurekaApps(env, verbose).then(data => {
    const eurekaApps = data;
    const appList = eurekaApps.applications.application;
    appList.filter(x => !excludeApps.includes(x.name)).forEach(app => {
      const instance = app.instance.find(x => x.status === 'UP');
      // const instanceJson = JSON.stringify(instance).replace(/"/g,'\\"');
      // const updateLocal = `curl -v -X POST -H "Content-type: application/xml" --data "${instanceJson}" http://localhost:8761/eureka/apps/${app.name}`;
      const portEnabled = instance.port['@enabled'];
      instance.port = instance.port.$;
      const securePortEnabled = instance.securePort['@enabled'];
      instance.securePort = instance.securePort.$;
      const dciClass = instance.dataCenterInfo['@class'];
      delete instance.dataCenterInfo['@class'];
      if (verbose) console.log('instance:', instance);
      let instanceXml = builder.buildObject(instance);
      instanceXml = instanceXml.replace('<port>', '<port enabled="' + portEnabled + '">')
      instanceXml = instanceXml.replace('<securePort>', '<securePort enabled="' + securePortEnabled + '">')
      instanceXml = instanceXml.replace('<dataCenterInfo>', '<dataCenterInfo class="' + dciClass + '">')
      postEurekaApp('local', app.name, instanceXml, verbose).then(response => {
        console.log(`Updated ${app.name} to local eureka.`);
      });
    });
  })
};

const _yargs = yargs(process.argv.slice(2))
  .version('Eurekat Version 1.0 - A Netflix Eureka Developer Utility')
  .usage('Usage: $0 -env QA2 [options]')
  .option('env', { alias: 'e', type: 'string', description: 'The environment to copy: QA1, QA2, QA3, QA4' })
  .option('delete', { alias: 'd', type: 'boolean', description: 'Delete existing local eureka entries' })
  .option('exclude', { alias: 'x', type: 'string', description: 'Comma delimited list of app names to not import' })
  .option('verbose', { alias: 'v', type: 'boolean', description: 'Run with verbose logging' });

const argv = _yargs.argv;
if (argv.verbose) {
  console.log('arguments:', argv);
}
if(!argv.delete && !argv.env){
  console.log('Either an env to copy or a delete command is required.');
  _yargs.showHelp();
}
if (argv.delete) {
  deleteLocalEureka(argv.env, argv.exclude ? argv.exclude.split(',') : [], argv.verbose);
}
if (argv.env) {
  updateLocalEureka(argv.env, argv.exclude ? argv.exclude.split(',') : [], argv.verbose);
}
