export const ipcChannels = {
  overlay: {
    state: 'overlay:state',
    getState: 'overlay:getState',
  },
  dashboard: {
    state: 'dashboard:state',
    getState: 'dashboard:getState',
  },
  dictation: {
    startPushToTalk: 'dictation:startPushToTalk',
    stopPushToTalk: 'dictation:stopPushToTalk',
    toggle: 'dictation:toggle',
    cancel: 'dictation:cancel',
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
  },
  history: {
    clear: 'history:clear',
    audio: 'history:audio',
    deleteEntry: 'history:deleteEntry',
  },
  telemetry: {
    tail: 'telemetry:tail',
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
