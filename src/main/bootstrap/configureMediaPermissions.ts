import type { Session } from 'electron'

const readMediaTypes = (details: unknown): Array<'video' | 'audio'> => {
  if (!details || typeof details !== 'object' || !('mediaTypes' in details)) {
    return []
  }

  const mediaTypes = (details as { mediaTypes?: Array<'video' | 'audio'> }).mediaTypes
  return Array.isArray(mediaTypes) ? mediaTypes : []
}

const isAudioOnlyMediaRequest = (permission: string, details: unknown): boolean => {
  if (permission !== 'media') {
    return false
  }

  const mediaTypes = readMediaTypes(details)
  return mediaTypes.length === 0 || mediaTypes.every((mediaType) => mediaType === 'audio')
}

export const configureMediaPermissions = (browserSession: Session): void => {
  browserSession.setPermissionCheckHandler((_webContents, permission, _origin, details) =>
    isAudioOnlyMediaRequest(permission, details),
  )

  browserSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    callback(isAudioOnlyMediaRequest(permission, details))
  })
}
