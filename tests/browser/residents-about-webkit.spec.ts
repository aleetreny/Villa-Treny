import { test } from '@playwright/test';
import { residentAndAboutChecks } from './residents-about-cases';

test.use({ browserName: 'webkit' });
residentAndAboutChecks('webkit');
