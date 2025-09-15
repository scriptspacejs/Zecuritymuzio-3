
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class ConfigManager {
    constructor() {
        this.db = new sqlite3.Database('./bot_config.db', (err) => {
            if (err) {
                console.error('Error opening config database:', err.message);
            } else {
                console.log('Connected to config SQLite database');
                this.initializeTables();
            }
        });
    }

    initializeTables() {
        // Server configurations table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS server_configs (
                guildId TEXT PRIMARY KEY,
                quarantineRoleId TEXT,
                bypassRoleId TEXT,
                antiNukeLogsChannelId TEXT,
                musicRequestChannelId TEXT,
                adminChannelId TEXT,
                voiceControlEnabled INTEGER DEFAULT 0,
                speechToTextEnabled INTEGER DEFAULT 0,
                aiChatEnabled INTEGER DEFAULT 1,
                defaultPunishment TEXT DEFAULT 'quarantine'
            )
        `);

        // Authentication status table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS auth_status (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                identifier TEXT NOT NULL,
                authenticated INTEGER DEFAULT 1,
                UNIQUE(type, identifier)
            )
        `);

        // Blacklisted words table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS blacklisted_words (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                word TEXT UNIQUE NOT NULL
            )
        `);

        // Quarantined users table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS quarantined_users (
                userId TEXT,
                guildId TEXT,
                originalRoles TEXT,
                quarantineTime INTEGER,
                reason TEXT,
                PRIMARY KEY (userId, guildId)
            )
        `);

        // Config backups table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS config_backups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                backup_data TEXT,
                created_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
        `);
    }

    // Server configuration methods
    async saveServerConfig(guildId, config) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT OR REPLACE INTO server_configs 
                (guildId, quarantineRoleId, bypassRoleId, antiNukeLogsChannelId, 
                 musicRequestChannelId, adminChannelId, voiceControlEnabled, 
                 speechToTextEnabled, aiChatEnabled, defaultPunishment)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            this.db.run(sql, [
                guildId,
                config.quarantineRoleId || null,
                config.bypassRoleId || null,
                config.antiNukeLogsChannelId || null,
                config.musicRequestChannelId || null,
                config.adminChannelId || null,
                config.voiceControlEnabled ? 1 : 0,
                config.speechToTextEnabled ? 1 : 0,
                config.aiChatEnabled !== false ? 1 : 0,
                config.defaultPunishment || 'quarantine'
            ], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    async getServerConfig(guildId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM server_configs WHERE guildId = ?',
                [guildId],
                (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row);
                    }
                }
            );
        });
    }

    async getAllServerConfigs() {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM server_configs',
                [],
                (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows || []);
                    }
                }
            );
        });
    }

    // Authentication methods
    async saveAuthStatus(type, identifier, authenticated) {
        return new Promise((resolve, reject) => {
            if (authenticated) {
                this.db.run(
                    'INSERT OR REPLACE INTO auth_status (type, identifier, authenticated) VALUES (?, ?, 1)',
                    [type, identifier],
                    function(err) {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(this.changes);
                        }
                    }
                );
            } else {
                this.db.run(
                    'DELETE FROM auth_status WHERE type = ? AND identifier = ?',
                    [type, identifier],
                    function(err) {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(this.changes);
                        }
                    }
                );
            }
        });
    }

    async getAllAuthStatus() {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM auth_status WHERE authenticated = 1',
                [],
                (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows || []);
                    }
                }
            );
        });
    }

    // Blacklisted words methods
    async addBlacklistedWord(word) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT OR IGNORE INTO blacklisted_words (word) VALUES (?)',
                [word.toLowerCase()],
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.changes > 0);
                    }
                }
            );
        });
    }

    async removeBlacklistedWord(word) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'DELETE FROM blacklisted_words WHERE word = ?',
                [word.toLowerCase()],
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.changes > 0);
                    }
                }
            );
        });
    }

    async getAllBlacklistedWords() {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT word FROM blacklisted_words ORDER BY word',
                [],
                (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows ? rows.map(row => row.word) : []);
                    }
                }
            );
        });
    }

    // Quarantined users methods
    async saveQuarantinedUser(userId, guildId, originalRoles, reason) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT OR REPLACE INTO quarantined_users (userId, guildId, originalRoles, quarantineTime, reason) VALUES (?, ?, ?, ?, ?)',
                [userId, guildId, JSON.stringify(originalRoles), Date.now(), reason],
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.changes);
                    }
                }
            );
        });
    }

    async getQuarantinedUser(userId, guildId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM quarantined_users WHERE userId = ? AND guildId = ?',
                [userId, guildId],
                (err, row) => {
                    if (err) {
                        reject(err);
                    } else if (row) {
                        resolve({
                            userId: row.userId,
                            guildId: row.guildId,
                            originalRoles: JSON.parse(row.originalRoles),
                            quarantineTime: row.quarantineTime,
                            reason: row.reason
                        });
                    } else {
                        resolve(null);
                    }
                }
            );
        });
    }

    async getAllQuarantinedUsersForGuild(guildId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM quarantined_users WHERE guildId = ?',
                [guildId],
                (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        const result = rows ? rows.map(row => ({
                            userId: row.userId,
                            guildId: row.guildId,
                            originalRoles: JSON.parse(row.originalRoles),
                            quarantineTime: row.quarantineTime,
                            reason: row.reason
                        })) : [];
                        resolve(result);
                    }
                }
            );
        });
    }

    async removeQuarantinedUser(userId, guildId) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'DELETE FROM quarantined_users WHERE userId = ? AND guildId = ?',
                [userId, guildId],
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.changes);
                    }
                }
            );
        });
    }

    // Backup methods
    async createBackup() {
        return new Promise((resolve, reject) => {
            // Get all data for backup
            const backupData = {};
            
            this.db.all('SELECT * FROM server_configs', [], (err, serverConfigs) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                backupData.serverConfigs = serverConfigs;
                
                this.db.all('SELECT * FROM auth_status', [], (err, authStatus) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    backupData.authStatus = authStatus;
                    
                    this.db.all('SELECT * FROM blacklisted_words', [], (err, blacklistedWords) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        
                        backupData.blacklistedWords = blacklistedWords;
                        
                        this.db.all('SELECT * FROM quarantined_users', [], (err, quarantinedUsers) => {
                            if (err) {
                                reject(err);
                                return;
                            }
                            
                            backupData.quarantinedUsers = quarantinedUsers;
                            
                            // Save backup
                            this.db.run(
                                'INSERT INTO config_backups (backup_data) VALUES (?)',
                                [JSON.stringify(backupData)],
                                function(err) {
                                    if (err) {
                                        reject(err);
                                    } else {
                                        resolve(this.lastID);
                                    }
                                }
                            );
                        });
                    });
                });
            });
        });
    }

    async getBackups(limit = 10) {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM config_backups ORDER BY created_at DESC LIMIT ?',
                [limit],
                (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows || []);
                    }
                }
            );
        });
    }

    // Close database connection
    close() {
        this.db.close((err) => {
            if (err) {
                console.error('Error closing config database:', err.message);
            } else {
                console.log('Config database connection closed');
            }
        });
    }
}

module.exports = ConfigManager;
