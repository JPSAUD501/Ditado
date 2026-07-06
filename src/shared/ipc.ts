export const ipcChannels = {
  dashboard: {
    getState: 'dashboard:getState',
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
  settings: {
    update: 'settings:update',
    setApiKey: 'settings:setApiKey',
  },
  hotkeys: {
    setCaptureMode: 'hotkeys:setCaptureMode',
    getStatus: 'hotkeys:getStatus',
    captureUpdate: 'hotkeys:captureUpdate',
  },
  history: {
    clear: 'history:clear',
    deleteEntry: 'history:deleteEntry',
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
