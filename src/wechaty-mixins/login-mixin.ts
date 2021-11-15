import * as PUPPET  from 'wechaty-puppet'
import { log }      from 'wechaty-puppet'

import type {
  WechatyEventListeners,
}                               from '../schema/mod.js'
import type {
  ContactSelfImpl,
  ContactSelfInterface,
}                               from '../user-modules/mod.js'
import type { WechatySkeleton } from '../wechaty/mod.js'

import type { GErrorMixin }     from './gerror-mixin.js'
import type { PuppetMixin }     from './puppet-mixin.js'

const loginMixin = <MixinBase extends typeof WechatySkeleton & PuppetMixin & GErrorMixin> (mixinBase: MixinBase) => {
  log.verbose('WechatyLoginMixin', 'loginMixin(%s)', mixinBase.name)

  abstract class LoginMixin extends mixinBase {

    __authQrCode?: string
    get authQrCode (): undefined | string {
      return this.__authQrCode
    }

    __loginMixinCleanCallbackList: (() => void)[]

    constructor (...args: any[]) {
      log.verbose('WechatyLoginMixin', 'constructor()')
      super(...args)
      this.__loginMixinCleanCallbackList = []
    }

    override async start (): Promise<void> {
      log.verbose('WechatyLoginMixin', 'start()')

      const cleanAuthQrCode = () => {
        this.__authQrCode = undefined
      }

      const onScan: WechatyEventListeners['scan'] = (qrcode, status) => {
        switch (status) {
          case PUPPET.type.ScanStatus.Cancel:
          case PUPPET.type.ScanStatus.Confirmed:
          case PUPPET.type.ScanStatus.Scanned:
            cleanAuthQrCode()
            break

          case PUPPET.type.ScanStatus.Timeout:  // TODO: confirm the `Timeout` spec (define it if it is not defined)
          case PUPPET.type.ScanStatus.Waiting:
            this.__authQrCode = qrcode
            break

          case PUPPET.type.ScanStatus.Unknown:
          default:
            break
        }
      }

      this.addListener('scan',  onScan)
      this.addListener('login', cleanAuthQrCode)
      this.addListener('stop',  cleanAuthQrCode)

      this.__loginMixinCleanCallbackList.push(
        () => {
          this.removeListener('scan',   onScan)
          this.removeListener('login',  cleanAuthQrCode)
          this.removeListener('stop',   cleanAuthQrCode)
        },
      )

      /**
       * Huan(202111): in this case, we put the `super.start()` at the end of the child `start()`
       *  because we need to register all the listeners before the puppet starts
       *  so that we will not miss any event.
       */
      await super.start()

    }

    override async stop (): Promise<void> {
      log.verbose('WechatyLoginMixin', 'stop()')

      while (this.__loginMixinCleanCallbackList.length) {
        const callback = this.__loginMixinCleanCallbackList.shift()
        if (callback) {
          setImmediate(callback)  // put callback to then end of event queue in case of it has not been called yet.
        }
      }

      await super.stop()
    }

    /**
     * Logout the bot
     *
     * @returns {Promise<void>}
     * @example
     * await bot.logout()
     */
    async logout (): Promise<void>  {
      log.verbose('WechatyLoginMixin', 'logout()')
      await this.puppet.logout()
    }

    /**
     * Get the logon / logoff state
     *
     * @returns {boolean}
     * @example
     * if (bot.logonoff()) {
     *   console.log('Bot logged in')
     * } else {
     *   console.log('Bot not logged in')
     * }
     */
    logonoff (): boolean {
      try {
        return this.puppet.logonoff()
      } catch (e) {
        this.emit('error', e)

        log.warn('WechatyLoginMixin', 'logonoff() puppet instance is not ready yet')
        // https://github.com/wechaty/wechaty/issues/1878
        return false
      }
    }

    /**
     * Get current user
     *
     * @returns {ContactSelfInterface}
     * @example
     * const contact = bot.currentUser()
     * console.log(`Bot is ${contact.name()}`)
     */
    currentUser (): ContactSelfInterface {
      const userId = this.puppet.currentUserId
      const user = (this.ContactSelf as typeof ContactSelfImpl).load(userId)
      return user
    }

    /**
     * Will be removed after Dec 31, 2022
     * @deprecated use {@link Wechaty#currentUser} instead
     */
    userSelf () {
      log.warn('WechatyLoginMixin', 'userSelf() deprecated: use currentUser() instead.\n%s',
        new Error().stack,
      )
      return this.currentUser()
    }

  }

  return LoginMixin
}

type LoginMixin = ReturnType<typeof loginMixin>

type ProtectedPropertyLoginMixin =
  | 'userSelf'  // deprecated: use `currentUser()` instead. (will be removed after Dec 31, 2022)
  | '__authQrCode'
  | '__loginMixinCleanCallbackList'

export type {
  LoginMixin,
  ProtectedPropertyLoginMixin,
}
export {
  loginMixin,
}