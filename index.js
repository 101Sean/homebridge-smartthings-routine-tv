// index.js
const axios = require('axios')

let Service, Characteristic, Bridge, Accessory, uuid

module.exports = (api) => {
    Service        = api.hap.Service
    Characteristic = api.hap.Characteristic

    Bridge         = api.hap.Bridge
    Accessory      = api.hap.Accessory       // ← MUST be the HAP class, not platformAccessory
    uuid           = api.hap.uuid

    api.registerPlatform(
        'homebridge-smartthings-routine-tv',  // package.json.name
        'StRoutineTV',                        // platform identifier
        StRoutineTV,
        true                                  // dynamic = true
    )
}

class StRoutineTV {
    constructor(log, config, api) {
        this.log       = log
        this.name      = config.name      || 'TV Routine'
        this.token     = config.token
        this.routineId = config.routineId
        this.api       = api

        if (!this.token || !this.routineId) {
            throw new Error('token and routineId are required')
        }

        this.api.on('didFinishLaunching', () => this.publishBridge())
    }

    publishBridge() {
        // 1) Create the Child Bridge
        const bridgeUUID  = uuid.generate(this.name)
        const childBridge = new Bridge(this.name, bridgeUUID)
        childBridge
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings')
            .setCharacteristic(Characteristic.Model,        'TVRoutineBridge')

        // 2) Create a pure HAP Accessory for the TV
        const tvAcc = new Accessory(this.name, uuid.generate(this.routineId))
        tvAcc.category = this.api.hap.Categories.TELEVISION

        // 3) Build out the Television service
        const tv = new Service.Television(this.name)
        tv
            .setCharacteristic(Characteristic.ConfiguredName, this.name)
            .setCharacteristic(
                Characteristic.SleepDiscoveryMode,
                Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
            )
        // ActiveIdentifier (required)
        tv.getCharacteristic(Characteristic.ActiveIdentifier)
            .setProps({ minValue:1, maxValue:1, validValues:[1] })
            .onGet(() => 1)
        // RemoteKey dummy
        tv.getCharacteristic(Characteristic.RemoteKey)
            .onSet((_, cb) => cb())
        // Dummy InputSource
        const inp = new Service.InputSource(
            `${this.name} Input`,
            uuid.generate(`${this.routineId}-in`)
        )
        inp
            .setCharacteristic(Characteristic.Identifier,             1)
            .setCharacteristic(Characteristic.ConfiguredName,         this.name)
            .setCharacteristic(Characteristic.IsConfigured,           Characteristic.IsConfigured.CONFIGURED)
            .setCharacteristic(Characteristic.InputSourceType,        Characteristic.InputSourceType.HDMI)
            .setCharacteristic(
                Characteristic.CurrentVisibilityState,
                Characteristic.CurrentVisibilityState.SHOWN
            )
        tv.addLinkedService(inp)
        tv.setPrimaryService()

        // 4) Power toggle
        tv.getCharacteristic(Characteristic.Active)
            .onGet(() => Characteristic.Active.INACTIVE)
            .onSet(async (v, cb) => {
                if (v === Characteristic.Active.ACTIVE) {
                    try {
                        await axios.post(
                            `https://api.smartthings.com/v1/scenes/${this.routineId}/execute`,
                            {},
                            { headers: { Authorization: `Bearer ${this.token}` } }
                        )
                        this.log.info(`Executed TV Routine: ${this.name}`)
                    } catch (err) {
                        this.log.error('Error executing TV routine', err)
                        return cb(new Error('SERVICE_COMMUNICATION_FAILURE'))
                    } finally {
                        tv.updateCharacteristic(
                            Characteristic.Active,
                            Characteristic.Active.INACTIVE
                        )
                    }
                }
                cb()
            })

        tvAcc.addService(tv)

        // 5) Bridge the TV accessory into your child Bridge
        childBridge.addBridgedAccessory(tvAcc)

        // 6) Publish _only_ the child bridge as an external accessory
        this.api.publishExternalAccessories(
            'homebridge-smartthings-routine-tv',
            [ childBridge ]
        )
        this.log.info(`Published child bridge "${this.name}" with TV accessory`)
    }

    configureAccessory() {} // no-op
}
