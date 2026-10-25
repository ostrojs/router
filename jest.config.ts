import { execSync } from "node:child_process";
import path from 'node:path';
import fs from 'node:fs';

let tsJestPath = "ts-jest";
try {
    tsJestPath = require.resolve("ts-jest");
} catch {
    try {
        const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
        const candidate = path.join(globalRoot, "ts-jest");
        if (fs.existsSync(candidate)) {
            tsJestPath = candidate;
        }
    } catch {}
}

export default {
    "testEnvironment": "node",
    "testMatch": [
        "**/test/**/*.test.ts",
        "**/test/**/*.test.js"
    ],
    "transform": {
        "^.+\\.ts$": [
            tsJestPath,
            {
                "tsconfig": "<rootDir>/tsconfig.json",
                "isolatedModules": true,
                "diagnostics": false
            }
        ]
    },
    "modulePathIgnorePatterns": [
        "<rootDir>/build/"
    ],
    "moduleNameMapper": {
        "^@ostro/router/(.*)$": "<rootDir>/src/$1",
        "^@ostro/router$": "<rootDir>/src/router"
    },
    "collectCoverage": true,
    "coverageDirectory": "coverage",
    "coverageReporters": [
        "text",
        "lcov",
        "clover"
    ],
    "collectCoverageFrom": [
        "<rootDir>/src/**/*.ts",
        "!<rootDir>/node_modules/**",
        "!<rootDir>/test/**",
        "!<rootDir>/coverage/**",
        "!<rootDir>/build/**"
    ],
    "modulePathIgnorePatterns": [
        "<rootDir>/build/"
    ]
};
