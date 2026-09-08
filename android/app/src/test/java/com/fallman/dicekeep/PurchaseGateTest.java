package com.fallman.dicekeep;

import org.junit.Test;
import static org.junit.Assert.*;

public class PurchaseGateTest {
    private static final String A = "a".repeat(64), B = "b".repeat(64);

    @Test public void duplicateLaunchDoesNotReplaceActivePurchase() {
        PurchaseGate gate = new PurchaseGate();
        assertTrue(gate.begin("dicekeep_shards_small", A));
        gate.markLaunched();
        assertFalse(gate.begin("dicekeep_shards_large", B));
        assertTrue(gate.matches("dicekeep_shards_small", A));
        assertFalse(gate.matches("dicekeep_shards_large", B));
    }

    @Test public void unrelatedRestoreOrDifferentAccountCannotResolveCurrentPurchase() {
        PurchaseGate gate = new PurchaseGate(); gate.begin("shards", A);
        gate.markLaunched();
        assertFalse(gate.matches("shards", B));
        assertFalse(gate.matches("other", A));
        assertFalse(gate.matches("shards", null));
        assertTrue(gate.matches("shards", A));
    }

    @Test public void callbackBeforeTheActualCheckoutCannotCompletePurchase() {
        PurchaseGate gate = new PurchaseGate();
        assertTrue(gate.begin("shards", A));
        assertFalse(gate.matches("shards", A));
        gate.markLaunched();
        assertTrue(gate.matches("shards", A));
        gate.clear();
        assertTrue(gate.begin("shards", A));
        assertFalse(gate.matches("shards", A));
    }

    @Test public void completionCancellationAndTimeoutReleaseTheGate() {
        PurchaseGate gate = new PurchaseGate();
        for (int i = 0; i < 3; i++) {
            assertTrue(gate.begin("shards", A)); gate.clear();
            assertFalse(gate.matches("shards", A));
        }
    }

    @Test public void rawIdentityAndInvalidProductNeverOpenPurchase() {
        assertFalse(PurchaseGate.validAccount("person@example.com"));
        assertFalse(PurchaseGate.validAccount("a".repeat(63)));
        assertFalse(PurchaseGate.validAccount("A".repeat(64)));
        assertTrue(PurchaseGate.validAccount(A));
        assertFalse(PurchaseGate.validProduct(""));
        assertFalse(PurchaseGate.validProduct("../invalid"));
        assertFalse(PurchaseGate.validProduct(null));
        assertTrue(PurchaseGate.validProduct("dicekeep.shards_1"));
    }
}
