package com.fallman.dicekeep;

import android.app.Activity;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import androidx.credentials.ClearCredentialStateRequest;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.ClearCredentialException;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.lifecycle.Lifecycle;
import com.android.billingclient.api.AccountIdentifiers;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import java.util.ArrayList;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Google UI + purchase-token transport only. The server verifies, grants and finalizes. */
@CapacitorPlugin(name = "DicekeepBilling")
public final class DicekeepBillingPlugin extends Plugin {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Map<PluginCall, Runnable> pending = new IdentityHashMap<>();
    private final Set<PluginCall> billingCalls = Collections.newSetFromMap(new IdentityHashMap<>());
    private final List<Runnable> connectionWaiters = new ArrayList<>();
    private final PurchaseGate gate = new PurchaseGate();
    private BillingClient billing;
    private CredentialManager credentials;
    private PluginCall purchaseCall, signInCall;
    private CancellationSignal signInCancellation;
    private Runnable connectionTimeout, ownedTimeout;
    private boolean destroyed, connecting, connectedOnce, queryingOwned;
    private int clientGeneration;

    @Override public void load() {
        onMain(() -> { credentials = CredentialManager.create(getContext()); createClient(); });
    }

    private void onMain(Runnable action) {
        if (Looper.myLooper() == Looper.getMainLooper()) action.run(); else main.post(action);
    }

    private boolean foreground() {
        Activity activity = getActivity();
        return activity != null && !activity.isFinishing() && !activity.isDestroyed()
            && getActivity().getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED);
    }

    private void createClient() {
        int generation = ++clientGeneration;
        connectedOnce = false; queryingOwned = false;
        if (ownedTimeout != null) main.removeCallbacks(ownedTimeout);
        billing = BillingClient.newBuilder(getContext())
            .setListener((result, purchases) -> onMain(() -> {
                if (!destroyed && generation == clientGeneration) purchasesUpdated(result, purchases);
            }))
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .enableAutoServiceReconnection().build();
    }

    private boolean begin(PluginCall call, long timeoutMs) {
        if (destroyed) { call.reject("앱을 다시 열고 시도해 주세요.", "CLOSED"); return false; }
        armTimeout(call, timeoutMs);
        return true;
    }

    private void armTimeout(PluginCall call, long timeoutMs) {
        Runnable old = pending.remove(call);
        if (old != null) main.removeCallbacks(old);
        Runnable timeout = () -> reject(call, "스토어 응답을 확인하지 못했습니다. 구매 복원으로 다시 확인해 주세요.", "TIMEOUT");
        pending.put(call, timeout); main.postDelayed(timeout, timeoutMs);
    }

    private boolean open(PluginCall call) { return !destroyed && pending.containsKey(call); }

    private boolean finish(PluginCall call) {
        Runnable timeout = pending.remove(call);
        if (timeout == null) return false;
        main.removeCallbacks(timeout);
        billingCalls.remove(call);
        if (call == purchaseCall) { purchaseCall = null; gate.clear(); }
        if (call == signInCall) {
            signInCall = null;
            if (signInCancellation != null) signInCancellation.cancel();
            signInCancellation = null;
        }
        return true;
    }

    private void resolve(PluginCall call, JSObject value) { if (finish(call)) call.resolve(value); }
    private void reject(PluginCall call, String message, String code) { if (finish(call)) call.reject(message, code); }

    private void billingError(PluginCall call, BillingResult result) {
        int code = result.getResponseCode();
        String message = code == BillingClient.BillingResponseCode.USER_CANCELED ? "결제가 취소되었습니다."
            : code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED ? "미처리 구매가 있습니다. 구매 복원으로 확인해 주세요."
            : code == BillingClient.BillingResponseCode.ITEM_UNAVAILABLE ? "현재 이 상품을 구매할 수 없습니다."
            : "Google Play에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";
        reject(call, message, code == BillingClient.BillingResponseCode.USER_CANCELED ? "USER_CANCELED" : "BILLING_" + code);
    }

    private void connected(PluginCall call, Runnable action) {
        if (destroyed || (call != null && !open(call))) return;
        if (call != null) billingCalls.add(call);
        if (billing == null) createClient();
        // After the first connection, API calls use the library's automatic
        // reconnection. Never start a competing reconnect from its disconnect callback.
        if (billing.isReady() || connectedOnce) { runOperation(call, action); return; }
        connectionWaiters.add(() -> { if (!destroyed && (call == null || open(call))) runOperation(call, action); });
        if (connecting) return;
        connecting = true;
        int generation = clientGeneration;
        connectionTimeout = () -> {
            if (!connecting || generation != clientGeneration) return;
            connecting = false; connectionWaiters.clear();
            for (PluginCall waiting : new ArrayList<>(billingCalls)) {
                reject(waiting, "Google Play 연결 시간이 초과되었습니다. 다시 시도해 주세요.", "CONNECTION_TIMEOUT");
            }
            billing.endConnection(); createClient();
        };
        main.postDelayed(connectionTimeout, 20000);
        billing.startConnection(new BillingClientStateListener() {
            @Override public void onBillingSetupFinished(BillingResult result) {
                onMain(() -> {
                    if (destroyed || generation != clientGeneration) return;
                    main.removeCallbacks(connectionTimeout); connecting = false;
                    List<Runnable> waiters = new ArrayList<>(connectionWaiters); connectionWaiters.clear();
                    if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        for (PluginCall waiting : new ArrayList<>(billingCalls)) billingError(waiting, result);
                        return;
                    }
                    connectedOnce = true;
                    for (Runnable waiter : waiters) waiter.run();
                    queryOwned(null);
                });
            }
            @Override public void onBillingServiceDisconnected() { /* Automatic reconnection on next API call. */ }
        });
    }

    private void runOperation(PluginCall call, Runnable action) {
        try { action.run(); }
        catch (RuntimeException ignored) {
            if (call != null) reject(call, "Google Play 요청을 처리하지 못했습니다. 다시 시도해 주세요.", "STORE_UNAVAILABLE");
        }
    }

    @PluginMethod public void signIn(PluginCall call) {
        onMain(() -> {
            if (signInCall != null) { call.reject("로그인 창이 이미 열려 있습니다.", "BUSY"); return; }
            String clientId = call.getString("serverClientId", ""), nonce = call.getString("nonce");
            if (!clientId.matches("[A-Za-z0-9._-]+\\.apps\\.googleusercontent\\.com") || clientId.length() > 256 || (nonce != null && nonce.length() > 256)) {
                call.reject("로그인 서비스 설정을 확인해 주세요.", "INVALID_ARGUMENT"); return;
            }
            if (!foreground()) { call.reject("앱 화면으로 돌아와 로그인해 주세요.", "NOT_FOREGROUND"); return; }
            if (!begin(call, 120000)) return;
            signInCall = call; signInCancellation = new CancellationSignal();
            try {
                GetSignInWithGoogleOption.Builder option = new GetSignInWithGoogleOption.Builder(clientId);
                if (nonce != null && !nonce.isEmpty()) option.setNonce(nonce);
                GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option.build()).build();
                credentials.getCredentialAsync(getActivity(), request, signInCancellation, main::post,
                    new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                        @Override public void onResult(GetCredentialResponse result) {
                            if (!open(call)) return;
                            try {
                                Credential credential = result.getCredential();
                                if (!(credential instanceof CustomCredential) || !GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
                                    reject(call, "Google 로그인 정보를 확인하지 못했습니다.", "INVALID_CREDENTIAL"); return;
                                }
                                String token = GoogleIdTokenCredential.createFrom(credential.getData()).getIdToken();
                                JSObject value = new JSObject(); value.put("idToken", token); resolve(call, value);
                            } catch (Exception ignored) { reject(call, "Google 로그인 정보를 확인하지 못했습니다.", "INVALID_CREDENTIAL"); }
                        }
                        @Override public void onError(GetCredentialException error) {
                            reject(call, error instanceof GetCredentialCancellationException ? "로그인이 취소되었습니다." : "Google 계정과 로그인 서비스 설정을 확인해 주세요.",
                                error instanceof GetCredentialCancellationException ? "USER_CANCELED" : "SIGN_IN_FAILED");
                        }
                    });
            } catch (Exception ignored) { reject(call, "Google 로그인 창을 열지 못했습니다.", "SIGN_IN_FAILED"); }
        });
    }

    @PluginMethod public void signOut(PluginCall call) {
        onMain(() -> {
            if (signInCall != null) reject(signInCall, "로그인이 취소되었습니다.", "USER_CANCELED");
            if (!begin(call, 30000)) return;
            try { credentials.clearCredentialStateAsync(new ClearCredentialStateRequest(), null, main::post,
                new CredentialManagerCallback<Void, ClearCredentialException>() {
                    @Override public void onResult(Void result) { resolve(call, new JSObject()); }
                    @Override public void onError(ClearCredentialException error) { reject(call, "Google 로그인 상태를 정리하지 못했습니다.", "SIGN_OUT_FAILED"); }
                }); } catch (RuntimeException ignored) { reject(call, "Google 로그인 상태를 정리하지 못했습니다.", "SIGN_OUT_FAILED"); }
        });
    }

    private List<String> productIds(PluginCall call) {
        JSArray input = call.getArray("productIds");
        if (input == null || input.length() == 0 || input.length() > 20) return null;
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        for (int i = 0; i < input.length(); i++) {
            Object value = input.opt(i);
            if (!(value instanceof String) || !PurchaseGate.validProduct((String) value)) return null;
            ids.add((String) value);
        }
        return new ArrayList<>(ids);
    }

    // The catalog sells one-time INAPP products: one ordinary buy option,
    // no rental, preorder or implicit discount selection. Display and launch use
    // the same selection rule, and launch always fetches fresh ProductDetails.
    private ProductDetails.OneTimePurchaseOfferDetails offer(ProductDetails product) {
        List<ProductDetails.OneTimePurchaseOfferDetails> offers = product.getOneTimePurchaseOfferDetailsList();
        if (offers == null) return null;
        ProductDetails.OneTimePurchaseOfferDetails selected = null;
        for (ProductDetails.OneTimePurchaseOfferDetails value : offers) {
            if (value.getRentalDetails() != null || value.getPreorderDetails() != null || (value.getOfferId() != null && !value.getOfferId().isEmpty())) continue;
            if (selected != null) return null;
            selected = value;
        }
        return selected;
    }

    private interface ProductsResult { void accept(List<ProductDetails> products); }
    private void queryProducts(PluginCall call, List<String> ids, ProductsResult callback) {
        List<QueryProductDetailsParams.Product> products = new ArrayList<>();
        for (String id : ids) products.add(QueryProductDetailsParams.Product.newBuilder().setProductId(id).setProductType(BillingClient.ProductType.INAPP).build());
        billing.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(products).build(), (result, details) -> onMain(() -> {
            if (!open(call)) return;
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { billingError(call, result); return; }
            runOperation(call, () -> callback.accept(details.getProductDetailsList()));
        }));
    }

    @PluginMethod public void products(PluginCall call) {
        onMain(() -> {
            List<String> ids = productIds(call);
            if (ids == null) { call.reject("조회할 상품을 확인해 주세요.", "INVALID_ARGUMENT"); return; }
            if (!begin(call, 30000)) return;
            connected(call, () -> queryProducts(call, ids, details -> {
                JSArray values = new JSArray(), unavailable = new JSArray();
                for (String id : ids) {
                    ProductDetails product = null;
                    for (ProductDetails candidate : details) if (id.equals(candidate.getProductId())) product = candidate;
                    ProductDetails.OneTimePurchaseOfferDetails price = product == null ? null : offer(product);
                    if (price == null) { unavailable.put(id); continue; }
                    JSObject value = new JSObject(); value.put("productId", id); value.put("title", product.getTitle());
                    value.put("formattedPrice", price.getFormattedPrice()); value.put("currencyCode", price.getPriceCurrencyCode());
                    value.put("priceAmountMicros", price.getPriceAmountMicros()); values.put(value);
                }
                JSObject result = new JSObject(); result.put("products", values); result.put("unavailableProductIds", unavailable); resolve(call, result);
            }));
        });
    }

    @PluginMethod public void purchase(PluginCall call) {
        onMain(() -> {
            String product = call.getString("productId"), account = call.getString("accountId");
            if (!PurchaseGate.validProduct(product) || !PurchaseGate.validAccount(account)) { call.reject("구매 계정과 상품을 다시 확인해 주세요.", "INVALID_ARGUMENT"); return; }
            if (!foreground()) { call.reject("앱 화면으로 돌아와 구매해 주세요.", "NOT_FOREGROUND"); return; }
            if (!gate.begin(product, account)) { call.reject("이미 진행 중인 결제가 있습니다.", "BUSY"); return; }
            if (!begin(call, 30000)) { gate.clear(); return; }
            purchaseCall = call;
            connected(call, () -> queryProducts(call, Collections.singletonList(product), details -> {
                ProductDetails selected = null;
                for (ProductDetails candidate : details) if (product.equals(candidate.getProductId())) selected = candidate;
                ProductDetails.OneTimePurchaseOfferDetails price = selected == null ? null : offer(selected);
                if (price == null) { reject(call, "현재 이 상품을 구매할 수 없습니다.", "ITEM_UNAVAILABLE"); return; }
                if (!foreground()) { reject(call, "앱 화면으로 돌아와 구매해 주세요.", "NOT_FOREGROUND"); return; }
                BillingFlowParams.ProductDetailsParams item = BillingFlowParams.ProductDetailsParams.newBuilder()
                    .setProductDetails(selected).setOfferToken(price.getOfferToken()).build();
                armTimeout(call, 300000);
                gate.markLaunched();
                BillingResult result = billing.launchBillingFlow(getActivity(), BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(Collections.singletonList(item)).setObfuscatedAccountId(account).build());
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    billingError(call, result);
                    if (result.getResponseCode() == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) queryOwned(null);
                }
            }));
        });
    }

    private JSArray purchaseRows(List<Purchase> purchases) {
        JSArray rows = new JSArray();
        if (purchases == null) return rows;
        for (Purchase purchase : purchases) {
            String state = purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED ? "PURCHASED"
                : purchase.getPurchaseState() == Purchase.PurchaseState.PENDING ? "PENDING" : null;
            if (state == null || purchase.getPurchaseToken().isEmpty()) continue;
            for (String product : purchase.getProducts()) {
                JSObject row = new JSObject(); row.put("purchaseToken", purchase.getPurchaseToken()); row.put("productId", product); row.put("state", state);
                rows.put(row);
            }
        }
        return rows;
    }

    private void deliver(List<Purchase> purchases, boolean checkoutCallback) {
        JSArray rows = purchaseRows(purchases);
        if (rows.length() > 0 && hasListeners("purchaseUpdated")) {
            JSObject value = new JSObject(); value.put("purchases", rows); notifyListeners("purchaseUpdated", value);
        }
        // An old unconsumed token returned by restore is not this checkout's
        // result. It still reaches the server through the event/restore response.
        if (!checkoutCallback || purchaseCall == null || purchases == null) return;
        for (Purchase purchase : purchases) {
            AccountIdentifiers ids = purchase.getAccountIdentifiers();
            String account = ids == null ? null : ids.getObfuscatedAccountId();
            for (String product : purchase.getProducts()) if (gate.matches(product, account)) {
                JSArray result = purchaseRows(Collections.singletonList(purchase));
                if (result.length() > 0) { resolve(purchaseCall, (JSObject) result.opt(0)); return; }
            }
        }
    }

    private void purchasesUpdated(BillingResult result, List<Purchase> purchases) {
        if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) deliver(purchases, true);
        else if (purchaseCall != null) billingError(purchaseCall, result);
    }

    private void queryOwned(PluginCall call) {
        if (destroyed || billing == null) return;
        if (call == null && queryingOwned) return;
        int generation = clientGeneration;
        if (call == null) {
            queryingOwned = true;
            ownedTimeout = () -> { queryingOwned = false; };
            main.postDelayed(ownedTimeout, 30000);
        }
        billing.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(), (result, purchases) -> onMain(() -> {
            if (destroyed || generation != clientGeneration) return;
            if (call == null) { queryingOwned = false; if (ownedTimeout != null) main.removeCallbacks(ownedTimeout); }
            if (call != null && !open(call)) return;
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { if (call != null) billingError(call, result); return; }
            deliver(purchases, false);
            if (call != null) { JSObject value = new JSObject(); value.put("purchases", purchaseRows(purchases)); resolve(call, value); }
        }));
    }

    @PluginMethod public void restore(PluginCall call) {
        onMain(() -> { if (begin(call, 30000)) connected(call, () -> queryOwned(call)); });
    }

    @Override @PluginMethod(returnType = PluginMethod.RETURN_NONE) public void addListener(PluginCall call) {
        call.setKeepAlive(true); // Bridge saves it as soon as this method returns.
        onMain(() -> {
            super.addListener(call);
            if ("purchaseUpdated".equals(call.getString("eventName"))) connected(null, () -> queryOwned(null));
        });
    }

    @Override @PluginMethod(returnType = PluginMethod.RETURN_NONE) public void removeListener(PluginCall call) {
        onMain(() -> super.removeListener(call));
    }

    @Override @PluginMethod public void removeAllListeners(PluginCall call) {
        onMain(() -> super.removeAllListeners(call));
    }

    @Override protected void handleOnResume() { onMain(() -> connected(null, () -> queryOwned(null))); }

    @Override protected void handleOnDestroy() {
        onMain(() -> {
            destroyed = true; clientGeneration++; connecting = false; connectionWaiters.clear();
            for (PluginCall call : new ArrayList<>(pending.keySet())) reject(call, "앱 화면이 닫혔습니다. 구매 복원으로 확인해 주세요.", "CLOSED");
            main.removeCallbacksAndMessages(null);
            super.removeAllListeners();
            if (billing != null) { billing.endConnection(); billing = null; }
            credentials = null;
        });
    }
}
