# Usage Instructions

Make sure you have NodeJS runtime installed. If not, [install it](https://nodejs.org).
 
If you are familiar with Git, clone this repository. Alternatively, you can download it as a zip file. To download a zip file with the contents of this repository, [go back to the main repository page](analytics-integration-samples/), click on "Clone or Download" and then click on Download ZIP. Once the download finishes, extract the contents of the zip file.

In order to run this simulator, you will need access to an instance of the Waton IoT Platform service. If you still don't have one, follow the instructions on [step 2 of this recipe](https://developer.ibm.com/recipes/tutorials/how-to-register-devices-in-ibm-iot-foundation/#r_step2) to create a Bluemix account and provision an instance of WIoTP.

The device simulator will need access to your WIoTP service in order to delete/create devices and device types, and also to publish device events. WIoTP access credentials are called API key and authentication token. Follow the instructions on [step 5 of this recipe](https://developer.ibm.com/recipes/tutorials/how-to-register-devices-in-ibm-iot-foundation/#r_step5) to create the credentials. Don't forget to write down the authentication token as it will not be available after you finish the process of creating your API key.
You will also need the ID of your WIoTP instance (also called "Org"). It can be found underneath your user name on the top right corner of the WIoTP page.

Now, back to the simulator, open your local copy of config/default.json (configuration file) and add your Watson IoT Platform Org, API key and authentication token in the corresponding property values.

Open a terminal, navigate to device_simulator folder and run the following command to install dependencies:

`npm install`

Wait for the installation to finish, then run the following command to start the simulator:

`node simulator.js`

 *Note: If you are using an old version of node (< v6), the command line to run the simulator needs to have the `--harmony-destructuring` flag, for example, `node --harmony-destructuring simulator.js`.

The simulator is going to do the following:
- Read the CSV file specified in config/default.json.
- Extract information on device types, device ids and device events from the CSV file.
- Try to delete all device types and device ids found in the CSV file from your WIoTP org.
- Create all device types and device ids found in the CSV file in your WIoTP org.
- Start publishing device events found in the CSV file to your WIoTP org.

That's it, you can now open the Devices page in your WIoTP org and check all the devices that were created. Then you can click in any device from the table and see the recent events list being populated with the payloads that the simulator is publishing.

For a summary of the documentation found here, run:

`node simulator.js help`


## Settings

Some simulator settings can be changed in config/default.json.

### Watson IoT Platform connection settings

Properties under `wiotp`:

`org`

The WIoTP organization, usually a string of 6 characters.

`apiKey`

The API key generated in WIoTP

`apiToken`

The authentication token for the API key.

`httpDomain`

The WIoTP HTTP domain.

`mqttDomain`

The WIoTP MQTT domain.

### Runtime parameters

Properties under `params`:

`csvFilePath`

Path to the CSV file (with device events) to be processed by the simulator. It is pointing to data/cloudant.csv (included CSV file) by default.

`delete`

If true, the simulator is going to try to delete all device types and device ids found in the CSV file from your WIoTP org.

`rebuild`

If true, the simulator is going to try to delete all device types and device ids found in the CSV file from your WIoTP org, and then recreate them.

`simulate`

If true, the simulator is going to assume that device ids and device types are already created in your WIoTP org and start publishing device events found in the CSV file.

`publishIntervalDivisor`

This property controls how many times faster the publishing of device events will be when compared to the timestamps found in the CSV file. It is set to 100 by default.


## Command line options

`org='your org' apikey='your api key' apitoken='your api authentication token'`

Passing WIoTP credentials as options will override the credentials from config/default.json. These options override `wiotp.org`, `wiotp.apiKey` and `wiotp.apiToken` properties from config/default.json.
Default: empty strings

`delete`

The simulator is going to try to delete all device types and device ids found in the CSV file from your WIoTP org. This option overrides `params.delete` property from config/default.json.
Default: false

`rebuild`

The simulator is going to try to delete all device types and device ids found in the CSV file from your WIoTP org, and then recreate them. This option overrides `params.rebuild` property from config/default.json.
Default: false

`simulate`

The simulator is going to assume that device ids and device types are already created in your WIoTP org and start publishing device events found in the CSV file. This option overrides `params.simulate` property from config/default.json.
Default: false

`csv='path/to/the/csv/file.csv'`

Path to the CSV file to be processed by the simulator. This option overrides the CSV file path from config/default.json.
Default: sample.csv

`divisor=10`

It controls how many times faster the publishing of device events will be when compared to the timestamps found in the CSV file. This option overrides `params.publishIntervalDivisor` property from config/default.json.
Default: 100

Example: `node simulator.js simulate divisor=10`

This command will tell the simulator to read the CSV file and start publishing device events using intervals 10 times lower than the actual intervals calculated from the event timestamps found in the CSV file.

You can also edit config/default.json to add these settings instead of passing them as options via command line.


## NOTES ON THE CSV FILE

There must be the following columns:

`deviceType`

Values must be device types.

`deviceId`

Values must be device ids.

`eventType`

Values must be event types.

`format`

Values must be 'json'.

`timestamp`

Values must be date/time strings in the following format 'YYYY-MM-DDTHH:MM:SS.SSSZ'.

Payload properties must be columns in the following format:

`<deviceType>_<eventType>_<propertyName>`

Example: `'thermometer_sensor_temperature'`

Values can be either strings or numbers, or empty strings in case a property is not present in the event row
