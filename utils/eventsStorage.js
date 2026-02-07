/**
 * Events Storage
 * Stores game events and user subscriptions
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const DATA_DIR = path.join(__dirname, '..', 'data');
const EVENTS_FILE = path.join(DATA_DIR, 'events.json');

// Event sources
const EVENT_SOURCES = {
    GNJOY: 'gnjoy',
    MANUAL: 'manual'
};

// Recurring patterns
const RECURRING_PATTERNS = {
    NONE: null,
    DAILY: 'daily',
    WEEKLY: 'weekly',
    MONTHLY: 'monthly'
};

/**
 * Ensures data directory exists
 */
function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

/**
 * Gets default events structure
 * @returns {Object} Default events object
 */
function getDefaultEvents() {
    return {
        events: [],
        subscriptions: [],
        lastScraped: null,
        lastUpdated: new Date().toISOString()
    };
}

/**
 * Loads events from file
 * @returns {Object} Events data
 */
function loadEvents() {
    ensureDataDir();
    
    try {
        if (fs.existsSync(EVENTS_FILE)) {
            const data = fs.readFileSync(EVENTS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        logger.error('Error loading events', { error: error.message });
    }
    
    return getDefaultEvents();
}

/**
 * Saves events to file
 * @param {Object} data - Events data to save
 */
function saveEvents(data) {
    ensureDataDir();
    
    try {
        data.lastUpdated = new Date().toISOString();
        fs.writeFileSync(EVENTS_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        logger.error('Error saving events', { error: error.message });
    }
}

/**
 * Generates unique event ID
 * @returns {string} Unique ID
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

/**
 * Adds a new event
 * @param {Object} eventData - Event data
 * @returns {Object} Created event
 */
function addEvent(eventData) {
    const events = loadEvents();
    
    const event = {
        id: generateId(),
        title: eventData.title,
        description: eventData.description || '',
        source: eventData.source || EVENT_SOURCES.MANUAL,
        sourceUrl: eventData.sourceUrl || null,
        startDate: eventData.startDate,
        endDate: eventData.endDate,
        recurring: eventData.recurring || null,
        notifyMinutesBefore: eventData.notifyMinutesBefore || [60, 15],
        imageUrl: eventData.imageUrl || null,
        createdAt: new Date().toISOString(),
        createdBy: eventData.createdBy || null
    };
    
    events.events.push(event);
    saveEvents(events);
    
    logger.info('Event added', { eventId: event.id, title: event.title });
    
    return event;
}

/**
 * Updates an existing event
 * @param {string} eventId - Event ID
 * @param {Object} updates - Fields to update
 * @returns {Object|null} Updated event or null
 */
function updateEvent(eventId, updates) {
    const events = loadEvents();
    const index = events.events.findIndex(e => e.id === eventId);
    
    if (index === -1) {
        return null;
    }
    
    // Don't allow updating ID or createdAt
    delete updates.id;
    delete updates.createdAt;
    
    events.events[index] = {
        ...events.events[index],
        ...updates,
        updatedAt: new Date().toISOString()
    };
    
    saveEvents(events);
    
    return events.events[index];
}

/**
 * Removes an event
 * @param {string} eventId - Event ID
 * @returns {boolean} Whether removed
 */
function removeEvent(eventId) {
    const events = loadEvents();
    const initialLength = events.events.length;
    
    events.events = events.events.filter(e => e.id !== eventId);
    
    // Also remove subscriptions for this event
    events.subscriptions = events.subscriptions.filter(s => s.eventId !== eventId);
    
    if (events.events.length < initialLength) {
        saveEvents(events);
        logger.info('Event removed', { eventId });
        return true;
    }
    
    return false;
}

/**
 * Gets all events
 * @param {Object} [filters] - Optional filters
 * @returns {Array} Events
 */
function getEvents(filters = {}) {
    const events = loadEvents();
    let result = events.events;
    
    // Filter by source
    if (filters.source) {
        result = result.filter(e => e.source === filters.source);
    }
    
    // Filter by date range
    if (filters.startAfter) {
        result = result.filter(e => new Date(e.startDate) >= new Date(filters.startAfter));
    }
    
    if (filters.startBefore) {
        result = result.filter(e => new Date(e.startDate) <= new Date(filters.startBefore));
    }
    
    // Only active events
    if (filters.activeOnly) {
        const now = new Date();
        result = result.filter(e => new Date(e.endDate) >= now);
    }
    
    // Sort by start date
    result.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    
    return result;
}

/**
 * Gets a single event by ID
 * @param {string} eventId - Event ID
 * @returns {Object|null} Event or null
 */
function getEvent(eventId) {
    const events = loadEvents();
    return events.events.find(e => e.id === eventId) || null;
}

/**
 * Subscribes a user to an event
 * @param {string} userId - User ID
 * @param {string} eventId - Event ID
 * @param {number} [notifyMinutesBefore=30] - When to notify
 * @returns {Object|null} Subscription or null if already exists
 */
function subscribe(userId, eventId, notifyMinutesBefore = 30) {
    const events = loadEvents();
    
    // Check if event exists
    if (!events.events.find(e => e.id === eventId)) {
        return null;
    }
    
    // Check if already subscribed
    const existing = events.subscriptions.find(s => 
        s.userId === userId && s.eventId === eventId
    );
    
    if (existing) {
        return existing;
    }
    
    const subscription = {
        id: generateId(),
        userId,
        eventId,
        notifyMinutesBefore,
        notified: false,
        createdAt: new Date().toISOString()
    };
    
    events.subscriptions.push(subscription);
    saveEvents(events);
    
    return subscription;
}

/**
 * Unsubscribes a user from an event
 * @param {string} userId - User ID
 * @param {string} eventId - Event ID
 * @returns {boolean} Whether unsubscribed
 */
function unsubscribe(userId, eventId) {
    const events = loadEvents();
    const initialLength = events.subscriptions.length;
    
    events.subscriptions = events.subscriptions.filter(s => 
        !(s.userId === userId && s.eventId === eventId)
    );
    
    if (events.subscriptions.length < initialLength) {
        saveEvents(events);
        return true;
    }
    
    return false;
}

/**
 * Gets subscriptions for a user
 * @param {string} userId - User ID
 * @returns {Array} User's subscriptions with event data
 */
function getUserSubscriptions(userId) {
    const events = loadEvents();
    const userSubs = events.subscriptions.filter(s => s.userId === userId);
    
    // Enrich with event data
    return userSubs.map(sub => ({
        ...sub,
        event: events.events.find(e => e.id === sub.eventId)
    })).filter(s => s.event); // Remove orphaned subscriptions
}

/**
 * Gets pending notifications (subscriptions that need to be notified)
 * @returns {Array} Pending notifications
 */
function getPendingNotifications() {
    const events = loadEvents();
    const now = new Date();
    const pending = [];
    
    for (const sub of events.subscriptions) {
        if (sub.notified) continue;
        
        const event = events.events.find(e => e.id === sub.eventId);
        if (!event) continue;
        
        const eventStart = new Date(event.startDate);
        const notifyTime = new Date(eventStart.getTime() - (sub.notifyMinutesBefore * 60 * 1000));
        
        if (now >= notifyTime && now < eventStart) {
            pending.push({
                subscription: sub,
                event,
                minutesUntilStart: Math.round((eventStart - now) / (60 * 1000))
            });
        }
    }
    
    return pending;
}

/**
 * Marks a subscription as notified
 * @param {string} subscriptionId - Subscription ID
 */
function markNotified(subscriptionId) {
    const events = loadEvents();
    const sub = events.subscriptions.find(s => s.id === subscriptionId);
    
    if (sub) {
        sub.notified = true;
        sub.notifiedAt = new Date().toISOString();
        saveEvents(events);
    }
}

/**
 * Updates the last scraped timestamp
 */
function updateLastScraped() {
    const events = loadEvents();
    events.lastScraped = new Date().toISOString();
    saveEvents(events);
}

/**
 * Gets events statistics
 * @returns {Object} Statistics
 */
function getStats() {
    const events = loadEvents();
    const now = new Date();
    
    const activeEvents = events.events.filter(e => new Date(e.endDate) >= now);
    const manualEvents = events.events.filter(e => e.source === EVENT_SOURCES.MANUAL);
    const gnjoyEvents = events.events.filter(e => e.source === EVENT_SOURCES.GNJOY);
    
    return {
        totalEvents: events.events.length,
        activeEvents: activeEvents.length,
        manualEvents: manualEvents.length,
        gnjoyEvents: gnjoyEvents.length,
        totalSubscriptions: events.subscriptions.length,
        lastScraped: events.lastScraped,
        lastUpdated: events.lastUpdated
    };
}

module.exports = {
    loadEvents,
    saveEvents,
    addEvent,
    updateEvent,
    removeEvent,
    getEvents,
    getEvent,
    subscribe,
    unsubscribe,
    getUserSubscriptions,
    getPendingNotifications,
    markNotified,
    updateLastScraped,
    getStats,
    EVENT_SOURCES,
    RECURRING_PATTERNS
};
