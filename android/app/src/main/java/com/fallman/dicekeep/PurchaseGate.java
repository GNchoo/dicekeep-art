package com.fallman.dicekeep;

/** Main-thread purchase identity gate. This is not an entitlement decision. */
final class PurchaseGate {
    private String product;
    private String account;
    private boolean launched;

    static boolean validProduct(String value) {
        return value != null && value.matches("[a-z0-9][a-z0-9._]{0,149}");
    }

    static boolean validAccount(String value) {
        return value != null && value.matches("[a-f0-9]{64}");
    }

    boolean begin(String productId, String accountId) {
        if (!validProduct(productId) || !validAccount(accountId)) throw new IllegalArgumentException("Invalid purchase identity");
        if (product != null) return false;
        product = productId;
        account = accountId;
        launched = false;
        return true;
    }

    void markLaunched() {
        if (product == null) throw new IllegalStateException("No active checkout");
        launched = true;
    }

    boolean matches(String productId, String accountId) {
        return launched && product != null && product.equals(productId) && account.equals(accountId);
    }

    void clear() { product = null; account = null; launched = false; }
}
