"""Autoapprendimento, passo 3: regressione logistica P(blocco | misure del tabellone).
    python3 scripts/apprendimento/fit.py valori.jsonl modello.json
Valida su un quinto delle posizioni tenuto da parte e confronta con il solo numero di celle vuote.
Il modello (b, use, c) va copiato in LEARNED_MODEL di game/learnedRisk.js, poi misurato con
npm run pericolo prima di adottarlo. Serve scikit-learn (pip install scikit-learn)."""
import json, sys
import numpy as np
from sklearn.linear_model import LogisticRegression

FEATURES = ['linee', 'punti', 'vuote', 'buchi1', 'buchi0', 'morte', 'quasi1', 'quasi2', 'quasi3', 'entrano',
            'nonEntra', 'barra', 'rombo', 'ferro', 'bandieraD', 'bandieraS', 'zone', 'zona1', 'zona2', 'zona3',
            'chiudibili', 'bassaBordo', 'bassaInterno']
USE = list(range(2, len(FEATURES)))  # le misure del tabellone (non linee e punti della mossa)

rows = [json.loads(l) for l in open(sys.argv[1])]
X = np.array([[r['f'][i] for i in USE] for r in rows])
lost = np.array([r['lost'] for r in rows], float)
K = np.array([r['K'] for r in rows], float)
pi = np.array([r['pi'] for r in rows])
test = (pi % 5) == 0

def fit(Xs, l, k, C=1.0):
    Xr = np.vstack([Xs, Xs])
    y = np.r_[np.ones(len(Xs)), np.zeros(len(Xs))]
    w = np.r_[l, k - l]
    return LogisticRegression(C=C, max_iter=10000).fit(Xr, y, sample_weight=w)

def ll(m, Xs, l, k):
    p = np.clip(m.predict_proba(Xs)[:, 1], 1e-9, 1 - 1e-9)
    return -np.sum(l * np.log(p) + (k - l) * np.log(1 - p)) / k.sum()

print(f"tabelloni {len(rows)}, futuri {int(K.sum())}, bloccati {int(lost.sum())} ({100*lost.sum()/K.sum():.1f}%)")
free = X[:, [0]]
m0 = fit(free[~test], lost[~test], K[~test])
print(f"log-loss in prova: solo celle vuote {ll(m0, free[test], lost[test], K[test]):.4f}")
for C in (0.1, 1.0, 10.0):
    m = fit(X[~test], lost[~test], K[~test], C)
    print(f"log-loss in prova: tutte le misure (C={C}) {ll(m, X[test], lost[test], K[test]):.4f}")
m = fit(X, lost, K, 1.0)
model = {'use': USE, 'names': [FEATURES[i] for i in USE], 'b': float(m.intercept_[0]), 'c': [float(v) for v in m.coef_[0]]}
for n, c in zip(model['names'], model['c']):
    print(f"  {n:12s} {c:+.3f}")
json.dump(model, open(sys.argv[2], 'w'), indent=1)
