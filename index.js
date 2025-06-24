// index.js
const axios  = require('axios')
const pkg    = require('./package.json')
const plugin = pkg.name     // 반드시 package.json 의 name 과 100% 일치

let Service, Characteristic, uuid

module.exports = api => {
    Service        = api.hap.Service
    Characteristic = api.hap.Characteristic
    uuid           = api.hap.uuid

    // dynamic=true 로 external accessory 모드
    api.registerPlatform(
        plugin,
        'StRoutinePlatform',
        StRoutinePlatform,
        true
    )
}

class StRoutinePlatform {
    constructor(log, config, api) {
        this.log       = log
        this.token     = config.token
        this.routineId = config.routineId
        this.name      = config.name    // 홈 앱에 보일 이름
        this.api       = api

        if (!this.token || !this.routineId || !this.name) {
            throw new Error('config에 name, token, routineId 필수')
        }
        this.api.on('didFinishLaunching', () => this.publishAccessory())
    }

    publishAccessory() {
        // TV 액세서리 하나만 생성
        const tvAcc = new this.api.platformAccessory(
            this.name,
            uuid.generate(this.routineId)
        )
        tvAcc.category = this.api.hap.Categories.TELEVISION

        // TV 서비스 세팅 (최소 요건만)
        const tv = new Service.Television(this.name)
        tv
            .setCharacteristic(Characteristic.ConfiguredName,    this.name)
            .setCharacteristic(
                Characteristic.SleepDiscoveryMode,
                Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
            )
        tv.getCharacteristic(Characteristic.Active)
            .onGet(() => Characteristic.Active.INACTIVE)
            .onSet(async value => {
                if (value === Characteristic.Active.ACTIVE) {
                    await axios.post(
                        `https://api.smartthings.com/v1/scenes/${this.routineId}/execute`,
                        {}, { headers:{ Authorization:`Bearer ${this.token}` } }
                    )
                    tv.updateCharacteristic(Characteristic.Active,
                        Characteristic.Active.INACTIVE)
                }
            })
        tvAcc.addService(tv)

        // 동적 외부 액세서리로 광고
        this.api.publishExternalAccessories(
            plugin,
            [ tvAcc ]
        )
        this.log.info('✅ Published TV Routine as external accessory')
    }

    configureAccessory() {}
}
