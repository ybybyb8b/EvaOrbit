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
assert.match(read("Sources/XKit/GrandSlam/Lookup/GrandSlamLookupManager.swift"), /deviceInfo\.clientInfo\.urlBagClientString/);
assert.match(read("Sources/XKit/GrandSlam/Requests/GrandSlamOperationRequest.swift"), /#if !os\(Linux\)\s+clientData\.merge\(deviceInfo\.dictionary\)/);

// Compile the actual patched implementation, plus its non-Linux branch, without
// importing the signing stack, reading credentials or contacting Apple.
fs.writeFileSync(outputFile, `import Foundation
enum LinuxIdentity { ${clientInfo} }
enum OtherIdentity { ${clientInfo.replaceAll("#if os(Linux)", "#if false")} }
let linux = LinuxIdentity.ClientInfo(modelID: "fixture")
let other = OtherIdentity.ClientInfo(modelID: "fixture")
precondition(linux.clientString == "<Pixel 7> <Android;14;UQ1A.240205.002> <com.apple.AuthKit/1 (com.apple.akd/1.0)>")
precondition(linux.clientString == LinuxIdentity.ClientInfo.androidClientString)
precondition(other.clientString == "<fixture> <Mac OS X;14.3.1;23D60> <com.apple.AuthKit/1 (com.apple.akd/1.0)>")
precondition(linux.urlBagClientString == other.clientString)
precondition(linux.userAgent == "akd/1.0 CFNetwork/808.1.4")
precondition(other.userAgent == "akd/1.0 CFNetwork/978.0.7 Darwin/18.7.0")
print("PASS: Linux auth/provisioning use Android, URL bag uses Mac, and non-Linux identity/UA are preserved")
`);
console.log("Prepared credential-free Swift client-info smoke test");
