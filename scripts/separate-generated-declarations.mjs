import { readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import ts from "typescript"

const outputDirectory = "dist"

const javaScriptFiles = await filesIn(outputDirectory)
await Promise.all(javaScriptFiles.map(separateDeclarations))

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nestedFiles = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name)

    if (entry.isDirectory()) return filesIn(entryPath)
    return entry.name.endsWith(".js") ? [entryPath] : []
  }))

  return nestedFiles.flat()
}

async function separateDeclarations(filePath) {
  const content = await readFile(filePath, "utf8")
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS)
  const lineNumbers = declarationEndLines(sourceFile)
  const lines = content.split("\n")

  for (const lineNumber of lineNumbers.toReversed()) {
    if (lines[lineNumber + 1]?.trim() !== "") lines.splice(lineNumber + 1, 0, "")
  }

  await writeFile(filePath, lines.join("\n"))
}

function declarationEndLines(sourceFile) {
  const declarationEnds = []

  for (const [index, statement] of sourceFile.statements.entries()) {
    const previousStatement = sourceFile.statements[index - 1]
    if (
      previousStatement !== undefined &&
      ts.isImportDeclaration(previousStatement) &&
      !ts.isImportDeclaration(statement)
    ) {
      declarationEnds.push(sourceFile.getLineAndCharacterOfPosition(previousStatement.end).line)
    }

    if (ts.isClassDeclaration(statement)) {
      for (const member of statement.members.slice(0, -1)) {
        declarationEnds.push(sourceFile.getLineAndCharacterOfPosition(member.end).line)
      }
    }

    if (
      (ts.isClassDeclaration(statement) || ts.isFunctionDeclaration(statement)) &&
      index < sourceFile.statements.length - 1
    ) {
      declarationEnds.push(sourceFile.getLineAndCharacterOfPosition(statement.end).line)
    }
  }

  return declarationEnds
}
