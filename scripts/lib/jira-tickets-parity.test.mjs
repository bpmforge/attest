// jira-tickets-parity.test.mjs — proves the JIRA board driver's re-exported
// validatePlan/writeScopeCollisions/claimable are the SAME functions as
// tickets-graph.mjs's, not a divergent reimplementation (the CRITICAL from
// the 2026-07-31 review: exact-string scope matching under-detected nested
// overlaps and missed the "both ready" collision guard, causing the
// conductor to halt on every ticket the moment the scope map grew past
// disjoint scopes).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as driver from './jira-tickets.mjs';
import * as graph from './tickets-graph.mjs';

test('driver re-exports are identical references to tickets-graph.mjs, not copies', () => {
  assert.equal(driver.validatePlan, graph.validatePlan);
  assert.equal(driver.writeScopeCollisions, graph.writeScopeCollisions);
  assert.equal(driver.claimable, graph.claimable);
});

test('nested scope overlap with one module ACTIVE is detected (reference: 1 collision)', () => {
  const plan = {
    modules: [
      {
        id: 'A',
        kind: 'module',
        lane: 'jira',
        status: 'claimed',
        write_scope: ['apps/api/src/import'],
        depends_on: [],
      },
      {
        id: 'B',
        kind: 'module',
        lane: 'jira',
        status: 'ready',
        write_scope: ['apps/api/src/import/parser.mjs'],
        depends_on: [],
      },
    ],
  };
  const refCollisions = graph.writeScopeCollisions(plan);
  const driverCollisions = driver.writeScopeCollisions(plan);
  assert.equal(refCollisions.length, 1);
  assert.deepEqual(driverCollisions, refCollisions);
});

test('identical scope with both modules ready reports no collision (reference: 0 collisions)', () => {
  const plan = {
    modules: [
      {
        id: 'A',
        kind: 'module',
        lane: 'jira',
        status: 'ready',
        write_scope: ['apps/api/src/import'],
        depends_on: [],
      },
      {
        id: 'B',
        kind: 'module',
        lane: 'jira',
        status: 'ready',
        write_scope: ['apps/api/src/import'],
        depends_on: [],
      },
    ],
  };
  const refCollisions = graph.writeScopeCollisions(plan);
  const driverCollisions = driver.writeScopeCollisions(plan);
  assert.equal(refCollisions.length, 0);
  assert.deepEqual(driverCollisions, refCollisions);
});

test('validatePlan and claimable agree between driver and reference on a mixed plan', () => {
  const plan = {
    modules: [
      {
        id: 'PROJ-1',
        kind: 'module',
        title: 'First',
        lane: 'jira',
        status: 'ready',
        owner: null,
        write_scope: ['src/a/**'],
        acceptance: ['does the thing'],
        depends_on: [],
      },
      {
        id: 'PROJ-2',
        kind: 'module',
        title: 'Second',
        lane: 'jira',
        status: 'blocked',
        owner: null,
        write_scope: ['src/b/**'],
        acceptance: ['does another thing'],
        depends_on: ['PROJ-1'],
      },
    ],
  };
  assert.deepEqual(driver.validatePlan(plan), graph.validatePlan(plan));
  assert.deepEqual(driver.claimable(plan), graph.claimable(plan));
  assert.equal(driver.claimable(plan).length, 1);
  assert.equal(driver.claimable(plan)[0].id, 'PROJ-1');
});
