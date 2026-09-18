// تجميع مسارات لوحة التحكم
import { Router } from '../../lib/http.js';
import { adminStatsRoutes } from './stats.js';
import { adminBookingRoutes } from './bookings.js';
import { adminContentRoutes } from './content.js';
import { adminSettingsRoutes } from './settings.js';
import { adminUserRoutes } from './users.js';

export const adminRoutes = new Router();

adminRoutes.use('/bookings', adminBookingRoutes);
adminRoutes.use('', adminStatsRoutes);
adminRoutes.use('', adminContentRoutes);
adminRoutes.use('', adminSettingsRoutes);
adminRoutes.use('', adminUserRoutes);
