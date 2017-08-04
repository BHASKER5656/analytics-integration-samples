/**
 *****************************************************************************
 Copyright (c) 2017 IBM Corporation and other Contributors.
 All rights reserved. This program and the accompanying materials
 are made available under the terms of the Eclipse Public License v1.0
 which accompanies this distribution, and is available at
 http://www.eclipse.org/legal/epl-v10.html
 *****************************************************************************
 **/

'use strict';

// External dependencies
const mqtt = require('mqtt');
const request = require('request');
const csv = require('csvtojson')
const config = require('config')

// Get a command line flag
const getCommandLineFlag = (argName) => process.argv.find(arg => arg === argName)

// Get a command line value (option='value')
const getCommandLineValue = (argName) => {
  const argEntry = process.argv.find(arg => arg.startsWith(`${argName}=`))
  return argEntry ? argEntry.split(`${argName}=`)[1] : null;
}

// WIoTP connection params
// Fallback rule: command line option -> config file
const ORG = getCommandLineValue('org') || config.get('wiotp.org');
const USERNAME = getCommandLineValue('apikey') || config.get('wiotp.apiKey');
const PASSWORD = getCommandLineValue('apitoken') || config.get('wiotp.apiToken');
const HTTP_DOMAIN = config.get('wiotp.httpDomain');
const MQTT_DOMAIN = config.get('wiotp.mqttDomain');
const IOTP_API = `https://${ORG}.${HTTP_DOMAIN}/api/v0002`;
const MQTT_URL = `mqtts://${ORG}.${MQTT_DOMAIN}:8883`;
const DEVICE_PASSWORD = 'iotanalytics';

// Simulator params
// Fallback rule: command line option -> config file -> hardcoded default value
const CSV_FILE_PATH = getCommandLineValue('csv') || config.get('params.csvFilePath') || 'sample.csv';
const EVENT_INTERVAL_DIVISOR = getCommandLineValue('divisor') || config.get('params.publishIntervalDivisor') || 1;
const DELETE_DATA = getCommandLineFlag('delete') || config.get('params.delete') || false;
const REBUILD_DATA = getCommandLineFlag('rebuild') || config.get('params.rebuild') || false;
const SIMULATE_DATA = getCommandLineFlag('simulate') || config.get('params.simulate') || false;
// Default action: rebuild WIoTP data and simulate
const REBUILD_AND_SIMULATE_DATA = !DELETE_DATA && !REBUILD_DATA && !SIMULATE_DATA;

// Check for input errors
let inputError = false;
if (!ORG || !USERNAME || !PASSWORD || !HTTP_DOMAIN || !MQTT_DOMAIN) {
  console.log();
  console.log('Missing one or more WIoTP connection settings. Please read instructions below.')
  inputError = true;
}

// Show help if 'help' is added to command line
if (inputError || getCommandLineFlag('help')) {
  console.log();
  console.log(`USAGE INSTRUCTIONS`);
  console.log();
  console.log(`Open config/default.json and add your Watson IoT Platform Org, API key and API token in the corresponding config property values`);
  console.log();
  console.log(`Then run:`);
  console.log(`node simulator.js`);
  console.log();
  console.log(`The simulator is going to do the following: `);
  console.log(`- Read the CSV file specified in config/default.json`);
  console.log(`- Extract information on device types, device ids and device events from the CSV file`);
  console.log(`- Try to delete all device types and device ids found in the CSV file from your WIoTP org`);
  console.log(`- Create all device types and device ids found in the CSV file in your WIoTP org`);
  console.log(`- Start publishing device events found in the CSV file to your WIoTP org`);
  console.log();
  console.log(`OPTIONS`);
  console.log();
  console.log(`delete`);
  console.log(`The simulator is going to try to delete all device types and device ids found in the CSV file from your WIoTP org`);
  console.log(`default: false`);
  console.log();
  console.log(`rebuild`);
  console.log(`The simulator is going to try to delete all device types and device ids found in the CSV file from your WIoTP org, and then recreate them`);
  console.log(`default: false`);
  console.log();
  console.log(`simulate`);
  console.log(`The simulator is going to assume that device ids and device types are already created in your WIoTP org and start publishing device events found in the CSV file`);
  console.log(`default: false`);
  console.log();
  console.log(`org='your org' apikey='your api key' apitoken='your api token'`);
  console.log(`Passing WIoTP credentials as options will override the credentials from config/default.json`);
  console.log(`default: empty strings`);
  console.log();
  console.log(`csv='path/to/the/csv/file.csv'`);
  console.log(`This option overrides the default csv file name from config/default.json`);
  console.log(`default: cloudant.csv`);
  console.log();
  console.log(`divisor=10`);
  console.log(`This option makes the publishing of device events 10 times faster (you can use other numbers as well) when compared to the timestamps found in the CSV file`);
  console.log(`default: 100`);
  console.log();
  console.log(`You can also edit config/default.json to add these settings instead of passing them as options via command line`);
  console.log();
  console.log(`NOTES ON THE CSV FILE`);
  console.log();
  console.log(`There must be the following columns:`);
  console.log()
  console.log(`deviceType`);
  console.log(`Values must be device types`);
  console.log()
  console.log(`deviceId`);
  console.log(`Values must be device ids`);
  console.log()
  console.log(`eventType`);
  console.log(`Values must be event types`);
  console.log()
  console.log(`format`);
  console.log(`Values must be 'json'`);
  console.log()
  console.log(`timestamp`);
  console.log(`Values must be date/time strings in the following format 'YYYY-MM-DDTHH:MM:SS.SSSZ'`);
  console.log()
  console.log(`Payload properties must be columns in the following format`);
  console.log(`<deviceType>_<eventType>_<propertyName>`);
  console.log(`Exmaple: 'thermometer_sensor_temperature'`);
  console.log(`Values can be either strings or numbers, or empty strings in case a property is not present in the event row'`);
  console.log()
  
  return;
}

// Convert milliseconds to HH:MM:SS
const millisecondsToHHMMSS = (intervalInMilliseconds) => {
  let milliseconds = parseInt((intervalInMilliseconds % 1000) / 100)
      , seconds = parseInt((intervalInMilliseconds / 1000) % 60)
      , minutes = parseInt((intervalInMilliseconds / (1000 * 60)) % 60)
      , hours = parseInt((intervalInMilliseconds / (1000 * 60 * 60)) % 24);
  hours = (hours < 10) ? "0" + hours : hours;
  minutes = (minutes < 10) ? "0" + minutes : minutes;
  seconds = (seconds < 10) ? "0" + seconds : seconds;
  return hours + ":" + minutes + ":" + seconds + "." + milliseconds;
}

// Set a timestamp before running the simulator
const startDate = new Date();
// Calculate simulator execution time
const getExecutionTime = () => millisecondsToHHMMSS(new Date().getTime() - startDate.getTime());

// Convert a raw JSON obtained from a row in the CSV file to a JSON with device events (containing metadata and payload to be published to WIoTP)
const convertFromRawDeviceData = (rawDeviceData) => {
  const { timestamp, deviceType, deviceId, eventType, format } = rawDeviceData;
  const rawDevicePayloadPrefix = `${deviceType}_${eventType}_`;

  const deviceData = { timestamp, deviceType, deviceId, eventType, format, d: {} };
  Object.keys(rawDeviceData).forEach(key => {
    if (key.startsWith(rawDevicePayloadPrefix) && rawDeviceData[key] !== '') {
      deviceData.d[key.split(rawDevicePayloadPrefix)[1]] = parseFloat(rawDeviceData[key]);
    }
  })
  return deviceData;
}

// Iterate through a sorted array of device event JSONs and add the 'timeSinceLastEvent' attribute
// with the interval (in milliseconds) between the previous event timestamp and the current event timestamp.
const addTimeSinceLastEvent = (sortedDevicesData) => sortedDevicesData
  .map((data, i, arr) => Object.assign({}, data, {
    timeSinceLastEvent: ((i > 0) ? (new Date(data.timestamp).getTime() - new Date(arr[i - 1].timestamp).getTime()) : 0)
  }));

// Sort an array of device JSONs by timestamp.
const sortDevicesDataByTimestamp = (devicesData) => devicesData
  .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

// Read the CSV file with device events and return an array of JSONs containing device metadata
// and the payload to be published to WIoTP
const readSimulatedDataFile = (fileName) => {
  return new Promise((resolve, reject) => {
    const simulatedDevicesData = [];
    csv().fromFile(fileName)
      .on('json', jsonObj => {
        simulatedDevicesData.push(convertFromRawDeviceData(jsonObj));
      })
      .on('done', error => {
        if (error) {
          reject(error);
        } else {
          resolve(addTimeSinceLastEvent(sortDevicesDataByTimestamp(simulatedDevicesData)));
        }
      });
  }); 
}

// Extract an array of unique devices (objects with id and type) from the array of device event JSONs
const getDevicesFromSimulatedData = (simulatedDevicesData) => Promise.resolve(simulatedDevicesData
  .filter((el1, i, arr) => arr.findIndex(el2 => el2.deviceId === el1.deviceId && el2.deviceType === el1.deviceType) === i)
  .map(el => ({
    id: el.deviceId,
    type: el.deviceType
  })))

// Extract an array of unique device types from the array of devices
const getDeviceTypesFromDevices = (devices) => Promise.resolve(devices
  .filter((el1, i, arr) => arr.findIndex(el2 => el2.type === el1.type) === i)
  .map(el => el.type))

// Delete device types from WIoTP using an array of unique device types
const deleteDeviceTypesFromWIoTP = (deviceTypes) => {
  return new Promise(resolve => {
    Promise.all(deviceTypes.map(type => {
      return new Promise(deleteResolve => {
        request.delete({
          url: `${IOTP_API}/device/types/${type}`,
          rejectUnauthorized: false,
        }, (error, response, body) => {
          const outputMessage = error ? `Error deleting device types from WIoTP: ${error}.` : `Device types deleted successfully.`;
          printResponse(outputMessage, response, body);
          deleteResolve();
        })
        .auth(USERNAME, PASSWORD, true);
      });
    })).then(resolve);
  });
}

// Create device types in WIoTP using an array of unique device types
const createDeviceTypesInWIoTP = (deviceTypes) => {
  return new Promise(resolve => {
    Promise.all(deviceTypes.map(type => {
      return new Promise(postResolve => {
        request.post({
          url: `${IOTP_API}/device/types`,
          rejectUnauthorized: false,
          json: true,
          body: {
            id: type,
            description: type,
            classId: 'Device',
            deviceInfo: {},
            metadata: {},
          }
        }, (error, response, body) => {
          const outputMessage = error ? `Error creating device types in WIoTP: ${error}.` : `Device types created successfully.`;
          printResponse(outputMessage, response, body);
          postResolve();
        })
        .auth(USERNAME, PASSWORD, true);
      });
    })).then(resolve);
  });
}

// Delete devices from WIoTP using an array of unique devices
const deleteDevicesFromWIoTP = (devices) => {
  return new Promise(resolve => {
    const body = [];
    devices.forEach(device => {
      body.push({ typeId: device.type, deviceId: device.id });
    });

    request.post({
      url: `${IOTP_API}/bulk/devices/remove`,
      rejectUnauthorized: false,
      json: true,
      body
    }, (error, response, body) => {
      const outputMessage = error ? `Error deleting devices from WIoTP: ${error}.` : `Devices deleted successfully.`;
      printResponse(outputMessage, response, body);
      resolve();
    })
    .auth(USERNAME, PASSWORD, true);
  });
}

// Create devices in WIoTP using an array of unique devices
const createDevicesInWIoTP = (devices) => {
  return new Promise(resolve => {
    const devicesBody = [];
    devices.forEach(device => {
        devicesBody.push({
          "typeId": device.type,
          "deviceId": device.id,
          "metadata": {},
          "authToken": DEVICE_PASSWORD
        });
      });

    request.post({
      url: `${IOTP_API}/bulk/devices/add`,
      rejectUnauthorized: false,
      json: true,
      body: devicesBody
    }, (error, response, body) => {
      const outputMessage = error ? `Error creating devices in WIoTP: ${error}.` : `Devices created successfully.`;
      printResponse(outputMessage, response, body);
      resolve();
    })
    .auth(USERNAME, PASSWORD, true);
  });
}


// const connectThenSendSimulatedPayloadAndDisconnect = (data) => {
//   return new Promise(resolve => {
//     const { deviceId, deviceType, eventType, format, d } = data;

//     const client = mqtt.connect(MQTT_URL, {
//       clientId: `d:${ORG}:${deviceType}:${deviceId}`,
//       username: 'use-token-auth',
//       rejectUnauthorized: false,
//       password: DEVICE_PASSWORD
//     });

//     client.on('connect', function () {
//       console.log(`Device ${deviceId} connected to org ${ORG}`);
//       const topic = `iot-2/evt/${eventType}/fmt/${format}`;
//       client.publish(topic, JSON.stringify(d), {}, () => client.end());
//       console.log(`Device ${deviceId} payload published to topic ${topic}: ${JSON.stringify(d)}`);
//     })
//     client.on('error', function (error) {
//       console.log(`Device ${deviceId} error ${error}`);
//       console.dir(error);
//       resolve();
//     })
//     client.on('close', function () {
//       console.log(`Device ${deviceId} connection closed`);
//       resolve();
//     })
//   });
// }

// Array of device connections
const connectionsMap = new Map();

// Connect devices to WIoTP using an array of unique devices
const connectDevices = (devices) => {
  return new Promise(resolve => {
    Promise.all(devices.map(device => {
      return new Promise(connectionResolve => {
        const { id, type } = device;
        const clientId = `d:${ORG}:${type}:${id}`;
        const createDeviceConnection = () => mqtt.connect(MQTT_URL, {
          clientId,
          username: 'use-token-auth',
          rejectUnauthorized: false,
          password: DEVICE_PASSWORD
        })

        const client = createDeviceConnection();
        
        client.on('connect', () => {
          console.log(`Device connection ${clientId} successfully established.`);
          if (!connectionsMap.has(clientId)) {
            connectionsMap.set(clientId, client);
            console.log(`${clientId} was added to the connection pool (size ${connectionsMap.size}).`);
          }
          connectionResolve();
        })

        client.on('error', (error) => {
          console.log(`An error occurred for ${clientId} error ${error}`);
          if (!connectionsMap.has(clientId)) {
            console.log(`Failed to create device connection ${clientId}.`);
          }
          connectionResolve();
        });
        
        client.on('close', () => {
          console.log(`Connection ${clientId} closed.`);
          if (connectionsMap.has(clientId)) {
            connectionsMap.delete(clientId);
            console.log(`${clientId} was removed from the connection pool  (size ${connectionsMap.size}).`);
          }
        })
      });
    })).then(resolve);
  });
}

// Publish a device payload to WIoTP using a JSON with device events (containing metadata and payload)
let numberOfPayloadsPublished = 0 
const sendSimulatedPayload = (deviceData) => {
  return new Promise(resolve => {
    const { deviceId, deviceType, eventType, format, d } = deviceData;
    const clientId = `d:${ORG}:${deviceType}:${deviceId}`;
    const client = connectionsMap.get(clientId);
    const topic = `iot-2/evt/${eventType}/fmt/${format}`;
    const payload = JSON.stringify(d);
    if (client) {
      client.publish(topic, payload, {}, () => {
        console.log(`${clientId} published payload ${payload} to topic ${topic}.`);
        numberOfPayloadsPublished++;
        resolve();
      });
    }
    else {
      console.log(`Device connection ${clientId} not found. Payload not sent.`);
      resolve();
    }
  });
}

// Disconnect all devices using connectionsMap
const disconnectDevices = () => {
  return new Promise(resolve => {
    Promise.all(Array.from(connectionsMap, ([clientId, client]) => {
      return new Promise(connectionResolve => {
        client.end();
        client.on('close', () => connectionResolve())
      });
    })).then(resolve);
  });
}

// Intercept process termination and disconnect all devices first
process.on('SIGINT', function() {
  console.log();
  console.log("Caught interrupt signal, closing device connections ...");
  disconnectDevices().then(process.exit);
});

// Delay the execution of a function that returns a promise
const delayPromiseExecution = (promiseFunction, milliseconds) => {
  return new Promise(resolve => {
    console.log(`Delaying ${millisecondsToHHMMSS(milliseconds)} ...`)
    setTimeout(() => {
      promiseFunction().then(resolve);
    }, milliseconds);
  });
}

// Iterate through all elements in the device event JSON array and
// create a chained promise that calls sendSimulatedPayload() in series for each event in the array
// (and respecting the interval between events)
const simulate = (devicesData) => {
  const deviceDataPublishPromises = devicesData
    .map(deviceData => () => delayPromiseExecution(() => sendSimulatedPayload(deviceData), deviceData.timeSinceLastEvent / EVENT_INTERVAL_DIVISOR));
  return deviceDataPublishPromises.reduce((p, f) => p.then(f), Promise.resolve());
}

const printResponse =  (error, response, body) => {
  console.log(error);
  console.log(response.statusCode);
  console.log(body);
}



// Helper function that extracts all the information needed by the simulator from the CSV file.
// It also forwards the arrays needed for further steps in the simulation.
const extractDataFromSimulatedDataFile = (csvFilePath) => readSimulatedDataFile(csvFilePath)
  .then(simulatedData => getDevicesFromSimulatedData(simulatedData)
    .then(devices => getDeviceTypesFromDevices(devices)
      .then(deviceTypes => Promise.resolve({ deviceTypes, devices, simulatedData }))
    )
  )


// Helper function that extracts all the information needed to delete/create devices and device types in WIoTP
// from the CSV file and deletes all these devices and device types from WIoTP.
// It also forwards the arrays needed for further steps in the simulation.
const deleteWIoTPDevicesDataFromSimulatedDataFile = (csvFilePath) => extractDataFromSimulatedDataFile(csvFilePath)
  .then(({ deviceTypes, devices, simulatedData }) => deleteDevicesFromWIoTP(devices)
    .then(() => deleteDeviceTypesFromWIoTP(deviceTypes)
      .then(() => Promise.resolve({ deviceTypes, devices, simulatedData }))
    )
  )

// Helper function that calls deleteWIoTPDevicesDataFromSimulatedDataFile() and also recreates devices and device types in WIoTP
// It also forwards the arrays needed for further steps in the simulation.
const rebuildWIoTPDevicesDataFromSimulatedDataFile = (csvFilePath) => deleteWIoTPDevicesDataFromSimulatedDataFile(csvFilePath)
  .then(({deviceTypes, devices, simulatedData}) => createDeviceTypesInWIoTP(deviceTypes)
    .then(() => createDevicesInWIoTP(devices))
    .then(() => Promise.resolve({ deviceTypes, devices, simulatedData }))
  )

// Run the selected job in the simulator ('delete', 'rebuild', 'simulate', or the default option which is 'rebuild then simulate')
if (DELETE_DATA){
  deleteWIoTPDevicesDataFromSimulatedDataFile(CSV_FILE_PATH)
    .then(() => console.log(`Finished deleting devices and device types in ${getExecutionTime()}`))
    .catch(console.error)
}
else if (REBUILD_DATA){
  rebuildWIoTPDevicesDataFromSimulatedDataFile(CSV_FILE_PATH)
    .then(() => console.log(`Finished rebuilding devices and device types in ${getExecutionTime()}`))
    .catch(console.error)
}
else if (SIMULATE_DATA){
  extractDataFromSimulatedDataFile(CSV_FILE_PATH)
    .then(({ devices, simulatedData }) => getDevicesFromSimulatedData(simulatedData)
      .then(() => console.log('Simulation data successfully read from CSV file. Connecting devices ...'))
      .then(() => connectDevices(devices))
      .then(() => console.log('Devices connected. Starting simulation ...'))
      .then(() => simulate(simulatedData))
      .then(() => console.log('Simulation ended (' + numberOfPayloadsPublished + ' events published). Disconnecting devices ...'))
      .then(disconnectDevices)
    )
    .then(() => console.log(`Done in ${getExecutionTime()}`))
    .catch(console.error)
}
else if (REBUILD_AND_SIMULATE_DATA) {
  rebuildWIoTPDevicesDataFromSimulatedDataFile(CSV_FILE_PATH)
    .then(({ devices, simulatedData }) => Promise.resolve(() => console.log('Devices and device types successfully created. Connecting devices ...'))
      .then(() => connectDevices(devices))
      .then(() => console.log('Devices connected. Starting simulation ...'))
      .then(() => simulate(simulatedData))
      .then(() => console.log('Simulation ended (' + numberOfPayloadsPublished + ' events published). Disconnecting devices ...'))
      .then(disconnectDevices)
    )
    .then(() => console.log(`Done in ${getExecutionTime()}`))
    .catch(console.error)
}

