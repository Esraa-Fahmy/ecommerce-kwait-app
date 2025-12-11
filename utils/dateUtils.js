const moment = require('moment-timezone');

/**
 * Returns the current time in Kuwait (Asia/Kuwait) as a Date object.
 * Note: This returns a Date object where the time components match Kuwait time,
 * even though the Date object itself technically tracks UTC.
 * This is "Fake UTC" storage strategy to satisfy the requirement of seeing
 * Kuwait time in the database directly.
 */
exports.toKuwaitiTime = () => {
    return moment().tz('Asia/Kuwait').format('YYYY-MM-DDTHH:mm:ss.SSS') + 'Z';
};

/**
 * Returns a mongoose default function for date fields
 */
exports.kuwaitiDateNow = () => {
    return new Date(moment().tz('Asia/Kuwait').format('YYYY-MM-DDTHH:mm:ss.SSS') + 'Z');
};
