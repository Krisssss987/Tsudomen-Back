const { faker } = require('@faker-js/faker');
const mqtt = require('mqtt');

const brokerUrl = 'mqtt://dashboard.senselive.in';
const port = 1883;
const username = 'Sense2023';
const password = 'sense123';
const topic = 'machine/data/WIRESIMULATION';

const client = mqtt.connect(brokerUrl, {
    port: port,
    username: username,
    password: password
  });


// Machine states
const STATES = ["STOPPED", "LINE_READY", "SLOW_RUN", "NORMAL_RUN", "JOG", "FILLING", "BREAKDOWN"];
const RUN_INTERVAL = 3600;
const PRODUCTION_TARGET = 100;
const NUM_BLOCKS = 7;
const NORMAL_SPEED = 100;
const SLOW_SPEED = 30;
const JOG_SPEED = 5;
const FILL_SPEED = 50;

let machine = {
    "Act Speed": 0,
    "ACT_COLD_DIA": faker.number.float({ min: 3.1, max: 5.5 }),
    "DIA SHEDULE": "5.5mm_To_3.10mm",
    "MC_STATUS": 0,
    "Target Speed": NORMAL_SPEED,
    "Emergency": false,
    "Fault Reset": false,
    "Inlet Wire Size": faker.number.float({ min: 6, max: 10 }),
    "LINE_SPEED": 0,
    "Break Release": false,
    "Speed Increase": false,
    "Speed decrease": false,
    "Start": false,
    "Stop": true,
    "Running Shift Hours": 0,
    "Running Shift Min": 0,
    "Running Shift Production": 0,
    "previous Month Production": faker.number.float({ min: 400000, max: 500000 }),
    "This Month Production": 0,
    "TOTAL_LENGTH": 0,
    "blocks": []
};

// Initialize blocks
for (let i = 1; i <= NUM_BLOCKS; i++) {
    machine["Block" + i + " Wire Size"] = faker.number.float({ min: 3, max: 8 });
    machine["Block" + i + " JOG FWD"] = false;
    machine["Block" + i + " JOG REV"] = false;
    machine["Block" + i + " Single/Multi"] = faker.datatype.boolean();
    machine["Block" + i + " WBS"] = faker.datatype.boolean();
    machine["Block" + i + " Door Ground"] = faker.datatype.boolean();
}

// Motor Data
for (let i = 1; i <= NUM_BLOCKS; i++) {
    machine["Motor " + i + " Current"] = faker.number.float({ min: 0.01, max: 0.03 });
    machine["Motor " + i + " HZ"] = 0.0;
}

// Downtime Flags (Only one can be active at a time)
const downtimeCategories = ['E_DT', 'M_DT', 'O_DT', 'P_DT'];
for (let category of downtimeCategories) {
    for (let i = 6; i <= 16; i++) {
        machine[`${category}_${i}`] = 0;
    }
}

// Function to simulate machine updates
function updateMachineCycle() {
    if (machine["MC_STATUS"] === 1) { // Machine is running
        machine["Act Speed"] = Math.min(machine["Act Speed"] + 5, NORMAL_SPEED);
        machine["LINE_SPEED"] = machine["Act Speed"];
        machine["Start"] = true;
        machine["Stop"] = false;
        machine["Break Release"] = true;

        // Simulate production increase based on speed
        if (machine["Act Speed"] === NORMAL_SPEED) {
            machine["This Month Production"] += PRODUCTION_TARGET; // Increase by target value
            machine["TOTAL_LENGTH"] += PRODUCTION_TARGET; // Simulate total production length
        }

        // Update shift time
        machine["Running Shift Min"] += 2;
        if (machine["Running Shift Min"] >= 60) {
            machine["Running Shift Hours"]++;
            machine["Running Shift Min"] = 0;
        }
    } else { // Machine is stopped
        machine["Act Speed"] = 0;
        machine["LINE_SPEED"] = 0;
        machine["Start"] = false;
        machine["Stop"] = true;
        machine["Break Release"] = false;
    }
}

// MQTT Connection Handlers
client.on('connect', () => {
    console.log('Connected to MQTT Broker!');
    
    // Simulation loop - Updates and publishes data every 5 minutes
    setInterval(() => {
        updateMachineCycle();
        const payload = JSON.stringify(machine);
        
        // Publish to MQTT topic
        client.publish(topic, payload, { qos: 1 }, (err) => {
            if (err) {
                console.error("Failed to publish data:", err);
            } else {
                console.log("Published data:", payload);
            }
        });
    }, 5 * 60 * 1000); // Every 5 minutes
});

client.on('error', (err) => {
    console.error('MQTT Connection Error:', err);
});

client.on('close', () => {
    console.log('MQTT Connection Closed');
});
