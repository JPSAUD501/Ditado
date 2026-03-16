import { join } from 'node:path'

import { writeTelemetryBuildConfigFile } from './lib/telemetryBuildConfig.mjs'

const outputPath = join(process.cwd(), 'build-config', 'telemetry.build.json')

const config = await writeTelemetryBuildConfigFile(outputPath)
console.log(`Generated telemetry build config at ${outputPath} (enabled=${config.enabled})`)
