// index.js
const axios = require('axios')

let Service, Characteristic, uuid

module.exports = (api) => {
    Service        = api.hap.Service
    Characteristic = api.hap.Characteristic
    uuid           = api.hap.uuid

    // registerAccessory로 변경: accessories 블록에서 설정
    api.registerAccessory(
        'homebridge-smartthings-routine-tv',  // package.json.name
        'StRoutineAccessory',                 // accessory identifier
        StRoutineAccessory
    )
}

class StRoutineAccessory {
    constructor(log, config) {
        this.log       = log
        this.name      = config.name
        this.token     = config.token
        this.routineId = config.routineId

        if (!this.token || !this.routineId) {
            throw new Error('token and routineId are required')
        }

        // 1) AccessoryInformation 서비스
        this.infoService = new Service.AccessoryInformation()
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings')
            .setCharacteristic(Characteristic.Model,        'TV Routine')
            .setCharacteristic(Characteristic.SerialNumber, this.routineId)

        // 2) TV 서비스
        this.tvService = new Service.Television(this.name)
        this.tvService
            .setCharacteristic(Characteristic.ConfiguredName, this.name)
            .setCharacteristic(
                Characteristic.SleepDiscoveryMode,
                Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
            )

        // 필수 ActiveIdentifier
        this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
            .setProps({ minValue:1, maxValue:1, validValues:[1] })
            .onGet(() => 1)

        // RemoteKey 더미
        this.tvService.getCharacteristic(Characteristic.RemoteKey)
            .onSet((_, cb) => cb())

        // 더미 InputSource
        const input = new Service.InputSource(
            `${this.name} Input`,
            uuid.generate(`${this.routineId}-in`)
        )
        input
            .setCharacteristic(Characteristic.Identifier,             1)
            .setCharacteristic(Characteristic.ConfiguredName,         this.name)
            .setCharacteristic(Characteristic.IsConfigured,           Characteristic.IsConfigured.CONFIGURED)
            .setCharacteristic(Characteristic.InputSourceType,        Characteristic.InputSourceType.HDMI)
            .setCharacteristic(
                Characteristic.CurrentVisibilityState,
                Characteristic.CurrentVisibilityState.SHOWN
            )
        this.tvService.addLinkedService(input)
        this.tvService.setPrimaryService()

        // 3) 전원(Active) 토글
        this.tvService.getCharacteristic(Characteristic.Active)
            .onGet(() => Characteristic.Active.INACTIVE)
            .onSet(async (value) => {
                if (value === Characteristic.Active.ACTIVE) {
                    try {
                        await axios.post(
                            `https://api.smartthings.com/v1/scenes/${this.routineId}/execute`,
                            {},
                            { headers:{ Authorization:`Bearer ${this.token}` } }
                        )
                        this.log.info(`Executed TV routine: ${this.name}`)
                    } catch (err) {
                        this.log.error('Error executing TV routine', err)
                        // 실패 시 HomeKit에 에러 표시
                        throw new this.api.hap.HapStatusError(
                            this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
                        )
                    } finally {
                        // 곧바로 꺼진 상태로 리셋
                        this.tvService.updateCharacteristic(
                            Characteristic.Active,
                            Characteristic.Active.INACTIVE
                        )
                    }
                }
            })
    }

    // Homebridge가 이 메서드를 호출해서 HAP 액세서리를 완성합니다.
    getServices() {
        return [
            this.infoService,
            this.tvService
        ]
    }
}
