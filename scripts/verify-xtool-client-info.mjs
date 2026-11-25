import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const [sourceDirectory, outputFile] = process.argv.slice(2);
assert(sourceDirectory && outputFile, "Usage: node scripts/verify-xtool-client-info.mjs <patched-xtool-source> <smoke.swift>");
const read = file => fs.readFileSync(path.join(sourceDirectory, file), "utf8").replace(/\r\n/g, "\n");
const source = read("Sources/XKit/GrandSlam/Anisette/DeviceInfo.swift");
const from = source.indexOf("    public struct ClientInfo: Codable {");
const to = source.indexOf("    /// `X-Mme-Device-Id`", from);
assert(from >= 0 && to > from, "Pinned ClientInfo structure changed; review before building");
const clientInfo = source.slice(from, to).trim();
assert.match(clientInfo, /#if os\(Linux\)/);
assert.match(read("Sources/XKit/GrandSlam/Anisette/XADIProvider.swift"), /func clientInfo\(\) async throws -> String \{\s*DeviceInfo\.ClientInfo\.androidClientString\s*\}/);
assert.match(read("Sources/XKit/GrandSlam/GrandSlamClient.swift"), /deviceInfo\.clientInfo\.clientString/);
assert.match(read("Sources/XKit/GrandSlam/Requests/GrandSlamOperationRequest.swift"), /deviceInfo\.clientInfo\.userAgent/);

// Compile the actual patched implementation, plus its non-Linux branch, without
// importing the signing stack, reading credentials or contacting Apple.
fs.writeFileSync(outputFile, `import Foundation
enum LinuxIdentity { ${clientInfo} }
enum OtherIdentity { ${clientInfo.replace("#if os(Linux)", "#if false")} }
let linux = LinuxIdentity.ClientInfo(modelID: "fixture")
let other = OtherIdentity.ClientInfo(modelID: "fixture")
precondition(linux.clientString == "<Pixel 7> <Android;14;UQ1A.240205.002> <com.apple.AuthKit/1 (com.apple.akd/1.0)>")
precondition(linux.clientString == LinuxIdentity.ClientInfo.androidClientString)
precondition(other.clientString == "<fixture> <Mac OS X;14.3.1;23D60> <com.apple.AuthKit/1 (com.apple.akd/1.0)>")
precondition(linux.userAgent == other.userAgent)
print("PASS: Linux login/provisioning use the same Android identity; non-Linux identity and User-Agent are preserved")
`);
console.log("Prepared credential-free Swift client-info smoke test");
