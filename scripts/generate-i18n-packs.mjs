import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT_DIRECTORY = path.join(PROJECT_ROOT, 'public', 'locales')
const LOCALES = ['en', 'es', 'zh-TW', 'fr']
const VERSION_MODULE = 'src/i18n/localePackVersion.ts'
const AUTHORING_MODULES = [
  ['app', 'src/i18n/namespaces/app.ts', 'appResources'],
  ['hud', 'src/i18n/namespaces/hud.ts', 'hudResources'],
  ['nasa', 'src/i18n/namespaces/nasa.ts', 'nasaResources'],
  ['tools', 'src/i18n/namespaces/tools.ts', 'toolsResources'],
  ['science', 'src/i18n/namespaces/science.ts', 'scienceResources'],
]

function formatDiagnostics(diagnostics) {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => PROJECT_ROOT,
    getNewLine: () => '\n',
  })
}

async function importAuthoringModule(temporaryDirectory, moduleName, relativePath) {
  const sourcePath = path.join(PROJECT_ROOT, relativePath)
  const source = await readFile(sourcePath, 'utf8')
  const result = ts.transpileModule(source, {
    fileName: sourcePath,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2023,
      module: ts.ModuleKind.ESNext,
      verbatimModuleSyntax: true,
    },
  })
  const errors = (result.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  )
  if (errors.length > 0) {
    throw new Error(formatDiagnostics(errors))
  }

  const outputPath = path.join(temporaryDirectory, `${moduleName}.mjs`)
  await writeFile(outputPath, result.outputText, 'utf8')
  return import(pathToFileURL(outputPath).href)
}

async function loadPackVersion(temporaryDirectory) {
  const module = await importAuthoringModule(
    temporaryDirectory,
    'locale-pack-version',
    VERSION_MODULE,
  )
  if (!Number.isInteger(module.LOCALE_PACK_VERSION) || module.LOCALE_PACK_VERSION < 1) {
    throw new TypeError('LOCALE_PACK_VERSION must be a positive integer')
  }
  return module.LOCALE_PACK_VERSION
}

async function createPacks() {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'asteria-i18n-'))
  try {
    const [packVersion, loaded] = await Promise.all([
      loadPackVersion(temporaryDirectory),
      Promise.all(
        AUTHORING_MODULES.map(([name, sourcePath]) =>
          importAuthoringModule(temporaryDirectory, name, sourcePath),
        ),
      ),
    ])
    const modules = Object.fromEntries(
      AUTHORING_MODULES.map(([name, , exportName], index) => {
        const resources = loaded[index][exportName]
        if (!resources || typeof resources !== 'object') {
          throw new TypeError(`${exportName} did not export a resource object`)
        }
        return [name, resources]
      }),
    )

    return Object.fromEntries(
      LOCALES.map((locale) => [
        locale,
        {
          version: packVersion,
          locale,
          resources: {
            app: modules.app[locale],
            hud: modules.hud[locale],
            nasa: modules.nasa[locale],
            tools: modules.tools[locale],
          },
          science: modules.science[locale],
        },
      ]),
    )
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

async function main() {
  const packs = await createPacks()
  const checkOnly = process.argv.includes('--check')
  await mkdir(OUTPUT_DIRECTORY, { recursive: true })

  for (const locale of LOCALES) {
    const outputPath = path.join(OUTPUT_DIRECTORY, `${locale}.json`)
    const generated = `${JSON.stringify(packs[locale], null, 2)}\n`
    if (checkOnly) {
      const committed = await readFile(outputPath, 'utf8').catch(() => '')
      if (committed !== generated) {
        throw new Error(`${path.relative(PROJECT_ROOT, outputPath)} is stale; run npm run i18n:generate`)
      }
      continue
    }
    await writeFile(outputPath, generated, 'utf8')
  }

  const action = checkOnly ? 'Verified' : 'Generated'
  console.log(`${action} ${LOCALES.length} locale packs in public/locales`)
}

await main()
