export const ipcChannels = {
  dashboard: {
    getNativeState: 'dashboard:getNativeState',
    nativeState: 'dashboard:nativeState',
    openTab: 'dashboard:openTab',
  },
  startup: {
    recorderReady: 'startup:recorderReady',
    recorderWarmupFinished: 'startup:recorderWarmupFinished',
  },
  dictation: {
    startPushToTalk: 'dictation:startPushToTalk',
    stopPushToTalk: 'dictation:stopPushToTalk',
    toggle: 'dictation:toggle',
    cancel: 'dictation:cancel',
    setOnboardingEnabled: 'dictation:setOnboardingEnabled',
    recorderStarted: 'dictation:recorderStarted',
    recorderFailed: 'dictation:recorderFailed',
    audioLevel: 'dictation:audioLevel',
  },
  hotkeys: {
    setCaptureMode: 'hotkeys:setCaptureMode',
    getStatus: 'hotkeys:getStatus',
    captureUpdate: 'hotkeys:captureUpdate',
  },
  permissions: {
    requestMicrophone: 'permissions:requestMicrophone',
    get: 'permissions:get',
  },
  dashboardNavigation: {
    openTab: 'dashboardNavigation:openTab',
  },
  updates: {
    check: 'updates:check',
    download: 'updates:download',
    install: 'updates:install',
  },
  shell: {
    openExternal: 'shell:openExternal',
  },
} as const
