/**
 * Tests for utils/alertStorage.js
 */

const fs = require('fs');

// Mock dependencies
jest.mock('fs');
jest.mock('../../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));

const alertStorage = require('../../utils/alertStorage');
const logger = require('../../utils/logger');

describe('alertStorage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        
        // Default mock implementations
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue(JSON.stringify({
            alerts: [
                {
                    id: 'alert-1',
                    uniqueId: 'alert-1',
                    searchTerm: 'Poring Card',
                    storeType: 'SELL',
                    server: 'FREYA',
                    userId: 'user123',
                    createdAt: '2024-01-01T00:00:00.000Z',
                    notified: false,
                    lowestPriceSeen: null
                }
            ],
            lastCheck: '2024-01-01T00:00:00.000Z'
        }));
        fs.writeFileSync.mockImplementation(() => {});
        fs.mkdirSync.mockImplementation(() => {});
    });

    describe('loadAlerts', () => {
        it('should load alerts from file', () => {
            const data = alertStorage.loadAlerts();
            
            expect(data).toHaveProperty('alerts');
            expect(data.alerts.length).toBe(1);
            expect(data.alerts[0].searchTerm).toBe('Poring Card');
        });

        it('should return default structure when file does not exist', () => {
            fs.existsSync.mockReturnValue(false);
            
            const data = alertStorage.loadAlerts();
            
            expect(data).toEqual({ alerts: [], lastCheck: null });
        });

        it('should return default on parse error', () => {
            fs.readFileSync.mockReturnValue('invalid json');
            
            const data = alertStorage.loadAlerts();
            
            expect(data).toEqual({ alerts: [], lastCheck: null });
            expect(logger.error).toHaveBeenCalled();
        });

        it('should create data directory if missing', () => {
            fs.existsSync.mockImplementation((path) => {
                if (path.includes('data') && !path.includes('market-alerts')) return false;
                return true;
            });
            
            alertStorage.loadAlerts();
            
            expect(fs.mkdirSync).toHaveBeenCalled();
        });
    });

    describe('saveAlerts', () => {
        it('should save alerts to file', () => {
            const data = { alerts: [], lastCheck: null };
            
            alertStorage.saveAlerts(data);
            
            expect(fs.writeFileSync).toHaveBeenCalled();
        });

        it('should throw on write error', () => {
            fs.writeFileSync.mockImplementation(() => {
                throw new Error('Write failed');
            });
            
            expect(() => {
                alertStorage.saveAlerts({ alerts: [] });
            }).toThrow('Write failed');
        });
    });

    describe('addAlert', () => {
        it('should add new alert', () => {
            let savedData;
            fs.writeFileSync.mockImplementation((path, data) => {
                savedData = JSON.parse(data);
            });
            
            const result = alertStorage.addAlert({
                userId: 'user456',
                searchTerm: 'Blue Potion',
                storeType: 'BUY',
                server: 'NIDHOGG'
            });
            
            expect(result).toHaveProperty('id');
            expect(result.searchTerm).toBe('Blue Potion');
            expect(savedData.alerts.length).toBe(2);
        });

        it('should throw on duplicate alert', () => {
            expect(() => {
                alertStorage.addAlert({
                    userId: 'user123',
                    searchTerm: 'Poring Card',
                    storeType: 'SELL',
                    server: 'FREYA'
                });
            }).toThrow();
        });

        it('should generate unique ID', () => {
            fs.readFileSync.mockReturnValue(JSON.stringify({ alerts: [], lastCheck: null }));
            
            const result = alertStorage.addAlert({
                userId: 'user123',
                searchTerm: 'Item',
                storeType: 'BUY',
                server: 'FREYA'
            });
            
            expect(result.id).toBeDefined();
            expect(typeof result.id).toBe('string');
        });
    });

    describe('removeAlert', () => {
        it('should remove alert by ID', () => {
            let savedData;
            fs.writeFileSync.mockImplementation((path, data) => {
                savedData = JSON.parse(data);
            });
            
            const result = alertStorage.removeAlert('alert-1', 'user123');
            
            expect(result).toBe(true);
            expect(savedData.alerts.length).toBe(0);
        });

        it('should return false for non-existent alert', () => {
            const result = alertStorage.removeAlert('non-existent', 'user123');
            
            expect(result).toBe(false);
        });

        it('should return false if user does not own alert', () => {
            const result = alertStorage.removeAlert('alert-1', 'different-user');
            
            expect(result).toBe(false);
        });
    });

    describe('getAlert', () => {
        it('should return alert by ID', () => {
            const alert = alertStorage.getAlert('alert-1');
            
            expect(alert).toBeDefined();
            expect(alert.id).toBe('alert-1');
        });

        it('should return null for non-existent ID', () => {
            const alert = alertStorage.getAlert('non-existent');
            
            expect(alert).toBeNull();
        });
    });

    describe('getUserAlerts', () => {
        it('should return alerts for specific user', () => {
            const alerts = alertStorage.getUserAlerts('user123');
            
            expect(alerts.length).toBe(1);
            expect(alerts[0].userId).toBe('user123');
        });

        it('should return empty array for user with no alerts', () => {
            const alerts = alertStorage.getUserAlerts('no-alerts-user');
            
            expect(alerts).toEqual([]);
        });
    });

    describe('updateAlert', () => {
        it('should update alert fields', () => {
            let savedData;
            fs.writeFileSync.mockImplementation((path, data) => {
                savedData = JSON.parse(data);
            });
            
            const result = alertStorage.updateAlert('alert-1', { maxPrice: 1000 });
            
            // Returns updated alert object on success
            expect(result).toBeDefined();
            expect(result.maxPrice).toBe(1000);
            expect(savedData.alerts[0].maxPrice).toBe(1000);
        });

        it('should return null for non-existent alert', () => {
            const result = alertStorage.updateAlert('non-existent', { maxPrice: 1000 });
            
            expect(result).toBeNull();
        });

        it('should update multiple fields', () => {
            let savedData;
            fs.writeFileSync.mockImplementation((path, data) => {
                savedData = JSON.parse(data);
            });
            
            alertStorage.updateAlert('alert-1', { 
                searchTerm: 'New Term',
                storeType: 'BUY',
                server: 'NIDHOGG'
            });
            
            expect(savedData.alerts[0].searchTerm).toBe('New Term');
            expect(savedData.alerts[0].storeType).toBe('BUY');
            expect(savedData.alerts[0].server).toBe('NIDHOGG');
        });
    });

    describe('updateLastCheck', () => {
        it('should update lastCheck timestamp', () => {
            let savedData;
            fs.writeFileSync.mockImplementation((path, data) => {
                savedData = JSON.parse(data);
            });
            
            alertStorage.updateLastCheck();
            
            expect(savedData.lastCheck).toBeDefined();
            expect(new Date(savedData.lastCheck)).toBeInstanceOf(Date);
        });
    });

    describe('getStats', () => {
        it('should return alert statistics', () => {
            fs.readFileSync.mockReturnValue(JSON.stringify({
                alerts: [
                    { userId: 'user1', storeType: 'BUY', server: 'FREYA', searchTerm: 'Item1' },
                    { userId: 'user1', storeType: 'SELL', server: 'FREYA', searchTerm: 'Item2' },
                    { userId: 'user2', storeType: 'BUY', server: 'NIDHOGG', searchTerm: 'Item3' }
                ],
                lastCheck: '2024-01-01T00:00:00.000Z'
            }));
            
            const stats = alertStorage.getStats();
            
            expect(stats.totalAlerts).toBe(3);
            expect(stats.uniqueUsers).toBe(2);
        });

        it('should handle empty alerts', () => {
            fs.readFileSync.mockReturnValue(JSON.stringify({ alerts: [], lastCheck: null }));
            
            const stats = alertStorage.getStats();
            
            expect(stats.totalAlerts).toBe(0);
            expect(stats.uniqueUsers).toBe(0);
        });
    });

    describe('clearUserAlerts', () => {
        it('should clear all alerts for user', () => {
            let savedData;
            fs.writeFileSync.mockImplementation((path, data) => {
                savedData = JSON.parse(data);
            });
            
            const removed = alertStorage.clearUserAlerts('user123');
            
            expect(removed).toBe(1);
            expect(savedData.alerts.length).toBe(0);
        });

        it('should return 0 if user has no alerts', () => {
            const removed = alertStorage.clearUserAlerts('no-alerts-user');
            
            expect(removed).toBe(0);
        });
    });

    describe('updateAlertNotified', () => {
        it('should update notification info', () => {
            let savedData;
            fs.writeFileSync.mockImplementation((path, data) => {
                savedData = JSON.parse(data);
            });
            
            alertStorage.updateAlertNotified('alert-1');
            
            expect(savedData.alerts[0].lastNotified).toBeDefined();
            expect(savedData.alerts[0].notificationCount).toBe(1);
        });

        it('should increment notification count', () => {
            fs.readFileSync.mockReturnValue(JSON.stringify({
                alerts: [{
                    id: 'alert-1',
                    notificationCount: 2
                }],
                lastCheck: null
            }));
            
            let savedData;
            fs.writeFileSync.mockImplementation((path, data) => {
                savedData = JSON.parse(data);
            });
            
            alertStorage.updateAlertNotified('alert-1');
            
            expect(savedData.alerts[0].notificationCount).toBe(3);
        });
    });

    describe('updateLowestPrice', () => {
        it('should update lowest price seen', () => {
            let savedData;
            fs.writeFileSync.mockImplementation((path, data) => {
                savedData = JSON.parse(data);
            });
            
            alertStorage.updateLowestPrice('alert-1', 5000);
            
            expect(savedData.alerts[0].lowestPriceSeen).toBe(5000);
        });
    });

    describe('getLowestPriceSeen', () => {
        it('should return lowest price for alert', () => {
            fs.readFileSync.mockReturnValue(JSON.stringify({
                alerts: [
                    { id: 'alert-1', lowestPriceSeen: 3000 }
                ],
                lastCheck: null
            }));
            
            const price = alertStorage.getLowestPriceSeen('alert-1');
            
            expect(price).toBe(3000);
        });

        it('should return null for non-existent alert', () => {
            const price = alertStorage.getLowestPriceSeen('non-existent');
            
            expect(price).toBeNull();
        });
    });

    describe('getGroupedAlerts', () => {
        it('should group alerts by searchTerm|server|storeType key', () => {
            fs.readFileSync.mockReturnValue(JSON.stringify({
                alerts: [
                    { server: 'FREYA', storeType: 'BUY', searchTerm: 'ItemA' },
                    { server: 'FREYA', storeType: 'BUY', searchTerm: 'ItemA' }, // Same key
                    { server: 'FREYA', storeType: 'SELL', searchTerm: 'ItemB' }
                ],
                lastCheck: null
            }));
            
            const grouped = alertStorage.getGroupedAlerts();
            
            // Keys are lowercase searchTerm|server|storeType
            expect(grouped['itema|FREYA|BUY']).toBeDefined();
            expect(grouped['itema|FREYA|BUY'].alerts.length).toBe(2);
            expect(grouped['itemb|FREYA|SELL']).toBeDefined();
            expect(grouped['itemb|FREYA|SELL'].alerts.length).toBe(1);
        });

        it('should return empty object for no alerts', () => {
            fs.readFileSync.mockReturnValue(JSON.stringify({ alerts: [], lastCheck: null }));
            
            const grouped = alertStorage.getGroupedAlerts();
            
            expect(Object.keys(grouped).length).toBe(0);
        });
    });
});
