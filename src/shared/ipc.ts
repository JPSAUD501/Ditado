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
    submitAudio: 'dictation:submitAudio',
    recorderStarted: 'dictation:recorderStarted',
    recorderFailed: 'dictation:recorderFailed',
  },
  settings: {
    update: 'settings:update',
    setApiKey: 'settings:setApiKey',
    benchmarkInsertion: 'settings:benchmarkInsertion',
  },
  hotkeys: {
    setCaptureMode: 'hotkeys:setCaptureMode',
  },
  history: {
    clear: 'history:clear',
    audio: 'history:audio',
  },
  telemetry: {
    tail: 'telemetry:tail',
  },
  permissions: {
    requestMicrophone: 'permissions:requestMicrophone',
    get: 'permissions:get',
  },
  devices: {
    listMicrophones: 'devices:listMicrophones',
  },
  dashboardNavigation: {
    openTab: 'dashboardNavigation:openTab',
  },
  updates: {
    check: 'updates:check',
  },
} as const
