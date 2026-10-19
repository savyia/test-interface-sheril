import React, {useEffect, useMemo, useRef, useState} from 'react';
import {useReport} from '../context/ReportContext';
import {TechProfile, Technologie, TransferAction} from '../types';
import {formatTechName} from '../utils/global';
import SearchableSelect from '../components/utils/SearchableSelect';
import Modal from '../components/utils/Modal';
import {
    PROFILE_VERSION, ActionProblem, checkTransfer, encodeProfile,
    normCode, parseProfilesBlock, validateActions,
} from '../utils/techProfile';
import {
    EMPTY_MANUAL, ManualData, getAllProfiles, getLatestManualBefore,
    getManualProfile, getPlan, removeProfile, saveManualProfile, savePlan, saveProfiles,
} from '../storage/techTransferStore';

type Tab = 'profil' | 'plan';

// Couleurs des marqueurs de la matrice
const C_KNOWN = '#4caf50';
const C_REACH = '#64b5f6';
const C_PROGRESS = '#ffa726';
const C_WISH = '#ffd54f';

const panel: React.CSSProperties = {
    background: '#181818', border: '1px solid #333', borderRadius: 6, padding: 12,
};
const selStyle: React.CSSProperties = {
    background: '#222', color: '#eee', border: '1px solid #444', borderRadius: 4, padding: '4px 6px',
};
// Pastille de transfert planifié, affichée dans la case du donneur
const pillStyle: React.CSSProperties = {
    marginLeft: 4, padding: '0 6px', borderRadius: 9, fontSize: '0.75em',
    background: '#1e3a1e', border: `1px solid ${C_KNOWN}`, color: '#9ed79e',
    cursor: 'pointer', whiteSpace: 'nowrap',
};

function techLabel(code: string, techs: Technologie[]): string {
    const t = techs.find(x => x.code === code);
    return t ? formatTechName(t) : code;
}

// Tag de groupe : [B]âtiment, [C]omposant, [M]aitrise
function typeTag(t: Technologie): string {
    return t.type === 0 ? '[B]' : t.type === 1 ? '[C]' : '[M]';
}

export default function TransfertTechno() {
    const {rapport, global} = useReport();
    const tour = rapport?.tour;

    const [tab, setTab] = useState<Tab>('profil');
    const [profilesByTour, setProfilesByTour] = useState<Record<number, TechProfile[]>>({});
    const [manual, setManual] = useState<ManualData>(EMPTY_MANUAL);
    const [plan, setPlan] = useState<TransferAction[]>([]);
    // Évite d'écraser le stockage juste après un chargement
    const skipSaveManual = useRef(true);
    const skipSavePlan = useRef(true);

    // Chargement du stockage quand le tour change (les parties manuelles
    // sont pré-remplies depuis le tour précédent)
    useEffect(() => {
        if (tour === undefined) return;
        skipSaveManual.current = true;
        skipSavePlan.current = true;
        setProfilesByTour(getAllProfiles());
        setManual(getManualProfile(tour) ?? getLatestManualBefore(tour) ?? EMPTY_MANUAL);
        setPlan(getPlan(tour));
    }, [tour]);

    useEffect(() => {
        if (skipSaveManual.current) {
            skipSaveManual.current = false;
            return;
        }
        if (tour !== undefined) saveManualProfile(tour, manual);
    }, [manual, tour]);

    useEffect(() => {
        if (skipSavePlan.current) {
            skipSavePlan.current = false;
            return;
        }
        if (tour !== undefined) savePlan(tour, plan);
    }, [plan, tour]);

    const techs = useMemo(() => global?.technologies ?? [], [global]);

    const techOptions = useMemo(() => techs
        .slice()
        .sort((a, b) => a.nom.localeCompare(b.nom) || a.niv - b.niv)
        .map(t => ({value: t.code, label: `${typeTag(t)} ${formatTechName(t)}`})), [techs]);

    // Souhaits et recherches en cours : seuls les codes recherchables du rapport sont proposés
    const researchableOptions = useMemo(() => {
        const reach = new Set((rapport?.technologiesAtteignables ?? []).map(normCode));
        return techOptions.filter(o => reach.has(normCode(o.value)));
    }, [techOptions, rapport]);

    // Profil du joueur local : parties auto du rapport + parties manuelles
    const ownProfile = useMemo<TechProfile | undefined>(() => {
        if (!rapport) return undefined;
        return {
            v: PROFILE_VERSION,
            tour: rapport.tour,
            num: rapport.joueur.numero,
            nom: rapport.joueur.nom,
            known: rapport.technologiesConnues ?? [],
            atteignable: rapport.technologiesAtteignables ?? [],
            inProgress: manual.inProgress,
            wishes: manual.wishes,
        };
    }, [rapport, manual]);

    // Matrice : profils importés du tour + le sien s'il n'a pas été importé
    const matrixProfiles = useMemo(() => {
        if (tour === undefined) return [];
        const imported = profilesByTour[tour] ?? [];
        if (ownProfile && !imported.some(p => p.num === ownProfile.num)) {
            return [...imported, ownProfile];
        }
        return imported;
    }, [tour, profilesByTour, ownProfile]);

    // --- Édition des parties manuelles ---

    const addWish = (code: string) => {
        if (!code) return;
        setManual(prev => prev.wishes.includes(code) ? prev : {...prev, wishes: [...prev.wishes, code]});
    };

    const removeWish = (code: string) => setManual(prev => ({...prev, wishes: prev.wishes.filter(w => w !== code)}));

    const moveWish = (index: number, delta: number) => {
        setManual(prev => {
            const target = index + delta;
            if (target < 0 || target >= prev.wishes.length) return prev;
            const wishes = [...prev.wishes];
            [wishes[index], wishes[target]] = [wishes[target], wishes[index]];
            return {...prev, wishes};
        });
    };

    const addInProgress = (code: string) => {
        if (!code) return;
        setManual(prev => prev.inProgress.includes(code) ? prev : {...prev, inProgress: [...prev.inProgress, code]});
    };

    const removeInProgress = (code: string) => setManual(prev => ({...prev, inProgress: prev.inProgress.filter(c => c !== code)}));

    // --- Import de profils ---

    const [importOpen, setImportOpen] = useState(false);
    const [importText, setImportText] = useState('');
    const [importResult, setImportResult] = useState<{count: number; errors: string[]} | undefined>(undefined);

    const closeImport = () => {
        setImportOpen(false);
        setImportText('');
        setImportResult(undefined);
    };

    const runImport = () => {
        const {profiles, errors} = parseProfilesBlock(importText);
        if (profiles.length > 0) {
            saveProfiles(profiles);
            setProfilesByTour(getAllProfiles());
        }
        setImportResult({count: profiles.length, errors});
    };

    const removeOne = (p: TechProfile) => {
        removeProfile(p.tour, p.num);
        setProfilesByTour(getAllProfiles());
    };

    // --- Plan (affiché en pastilles sur la matrice) ---

    const validated = useMemo(() => validateActions(plan, matrixProfiles), [plan, matrixProfiles]);
    const hasErrors = validated.some(v => v.problems.some(p => p.kind === 'error'));

    // « Mes actions » : ne montre que les lignes où ce joueur donne ou reçoit
    const [viewerNum, setViewerNum] = useState<number | ''>('');

    // (donneur, techno) -> actions planifiées, pour dessiner les pastilles
    type CellAction = {a: TransferAction; i: number; problems: ActionProblem[]};
    const cellActions = useMemo(() => {
        const m = new Map<string, CellAction[]>();
        plan.forEach((a, i) => {
            const k = `${a.from}|${normCode(a.code)}`;
            const list = m.get(k) ?? [];
            list.push({a, i, problems: validated[i]?.problems ?? []});
            m.set(k, list);
        });
        return m;
    }, [plan, validated]);

    // Donneurs qui ont déjà utilisé leur cadeau du tour
    const usedGivers = useMemo(() => new Set(plan.map(a => a.from)), [plan]);

    // Receveurs qui ont déjà reçu une techno ce tour, et leurs cases reçues
    const usedReceivers = useMemo(() => new Set(plan.map(a => a.to)), [plan]);
    const receivedCells = useMemo(() => new Set(plan.map(a => `${a.to}|${normCode(a.code)}`)), [plan]);

    // Drag en cours (donneur + techno) : sert à surligner les cibles de dépôt
    const [dragging, setDragging] = useState<{from: number; code: string} | null>(null);

    // Petit message passager (dépôt refusé), s'effoule tout seul
    const [notice, setNotice] = useState<string | undefined>(undefined);
    useEffect(() => {
        if (!notice) return;
        const t = setTimeout(() => setNotice(undefined), 2500);
        return () => clearTimeout(t);
    }, [notice]);

    // Dépôt d'un ✓ sur une case receveuse : règles du jeu, puis ajout au plan
    const handleDrop = (receiver: TechProfile) => {
        if (!dragging) return;
        const res = checkTransfer(plan, dragging.from, receiver.num, dragging.code, matrixProfiles);
        if (!res.ok) {
            setNotice(res.message);
            return;
        }
        setPlan(prev => [...prev, {from: dragging.from, code: dragging.code, to: receiver.num}]);
    };

    const nameOf = useMemo(() => new Map(matrixProfiles.map(p => [p.num, p.nom])), [matrixProfiles]);

    const planText = useMemo(() => {
        if (tour === undefined || plan.length === 0) return '';
        const lines = plan.map(a =>
            `- ${nameOf.get(a.from) ?? `#${a.from}`} donne ${techLabel(a.code, techs)} à ${nameOf.get(a.to) ?? `#${a.to}`}`);
        return [`Plan transfert techno — tour ${tour}`, ...lines].join('\n');
    }, [plan, tour, nameOf, techs]);

    const copyText = (text: string, okMsg: string) => {
        navigator.clipboard.writeText(text)
            .then(() => alert(okMsg))
            .catch(() => alert('Copie impossible.'));
    };

    const removeAction = (index: number) => setPlan(prev => prev.filter((_, i) => i !== index));

    const [confirmClear, setConfirmClear] = useState(false);

    // Réarme la confirmation de « Vider » quand le plan change
    useEffect(() => setConfirmClear(false), [plan]);

    // --- Matrice : filtres ---

    const [filterText, setFilterText] = useState('');
    const [filterType, setFilterType] = useState<'all' | '0' | '1' | '-1'>('all');
    const [onlyWished, setOnlyWished] = useState(false);
    const [onlyGaps, setOnlyGaps] = useState(false);
    const [showAllRows, setShowAllRows] = useState(false);

    const profileSets = useMemo(() => matrixProfiles.map(p => ({
        nom: p.nom,
        known: new Set(p.known.map(normCode)),
        reach: new Set(p.atteignable.map(normCode)),
        inProgress: new Set(p.inProgress.map(normCode)),
        wished: new Set(p.wishes.map(normCode)),
    })), [matrixProfiles]);

    type RowState = {
        known: boolean;
        reach: boolean;
        inProgress: boolean;
        wished: boolean;
    };
    type MatrixRow = { tech: Technologie; states: RowState[]; gap: boolean; owners: number };

    const rows = useMemo<MatrixRow[]>(() => {
        const q = filterText.trim().toLowerCase();
        const out: MatrixRow[] = [];
        for (const tech of techs) {
            if (q && !(tech.nom?.toLowerCase().includes(q) || tech.code.toLowerCase().includes(q))) continue;
            if (filterType !== 'all' && String(tech.type) !== filterType) continue;

            const nCode = normCode(tech.code);
            const states = profileSets.map(ps => ({
                known: ps.known.has(nCode),
                reach: ps.reach.has(nCode),
                inProgress: ps.inProgress.has(nCode),
                wished: ps.wished.has(nCode),
            }));
            const anyActivity = states.some(s => s.known || s.reach || s.wished || s.inProgress);
            const gap = states.some(s => s.wished) && !states.some(s => s.known);
            const owners = states.filter(s => s.known).length;
            // Une techno que tout le monde connaît n'a plus rien à apporter
            if (states.length > 0 && states.every(s => s.known)) continue;
            if (!showAllRows && !anyActivity) continue;
            if (onlyWished && !states.some(s => s.wished)) continue;
            if (onlyGaps && !gap) continue;
            // « Mes actions » : lignes où ce joueur donne ou reçoit
            if (viewerNum !== '' && !plan.some(a => normCode(a.code) === nCode && (a.from === viewerNum || a.to === viewerNum))) continue;
            out.push({tech, states, gap, owners});
        }
        return out;
    }, [techs, profileSets, filterText, filterType, onlyWished, onlyGaps, showAllRows, viewerNum, plan]);

    const renderCell = (s: RowState, row: MatrixRow, p: TechProfile) => {
        const acts = cellActions.get(`${p.num}|${normCode(row.tech.code)}`) ?? [];
        const gaveElsewhere = usedGivers.has(p.num) && acts.length === 0;
        // Un receveur n'en reçoit qu'une : ses ▣/★ s'estompent (sauf la case reçue)
        const receivedHere = receivedCells.has(`${p.num}|${normCode(row.tech.code)}`);
        const receivedElsewhere = usedReceivers.has(p.num) && !receivedHere;
        const marks: React.ReactNode[] = [];
        if (s.known) marks.push(
            <span
                key="k"
                style={{color: C_KNOWN, opacity: gaveElsewhere ? 0.35 : 1}}
                title={gaveElsewhere ? 'Connaît (a déjà donné ce tour)' : 'Connaît — glisser vers un joueur qui peut la recevoir'}
            >✓</span>
        );
        if (s.reach) marks.push(
            <span
                key="r"
                style={{color: C_REACH, opacity: receivedElsewhere ? 0.35 : 1, backgroundColor: row.gap ? 'rgba(100,181,246,0.18)' : undefined, padding: row.gap ? '0 3px' : undefined, borderRadius: 3}}
                title={receivedElsewhere ? 'Peut la rechercher (a déjà reçu une techno ce tour)' : row.gap ? 'Peut la rechercher (personne ne la connaît — bon candidat)' : 'Peut la rechercher (cible de transfert possible)'}
            >▣</span>
        );
        if (s.inProgress) marks.push(<span key="p" style={{color: C_PROGRESS}} title="En cours de recherche">→</span>);
        if (s.wished) marks.push(
            <span key="w" style={{color: C_WISH, opacity: receivedElsewhere ? 0.35 : 1}} title={receivedElsewhere ? 'Souhaitée (a déjà reçu une techno ce tour)' : 'Souhaitée'}>★</span>
        );
        return (
            <>
                {marks.length > 0 ? <>{marks}</> : <span style={{color: '#3a3a3a'}}>·</span>}
                {acts.map(({a, i, problems}) => {
                    const bad = problems.some(pr => pr.kind === 'error');
                    return (
                        <button
                            key={i}
                            onClick={() => removeAction(i)}
                            title={bad ? problems.map(pr => pr.message).join(' ; ') : 'Transfert planifié — cliquer pour retirer'}
                            style={{...pillStyle, ...(bad ? {background: '#3a1e1e', border: '1px solid #a55', color: '#e99'} : {})}}
                        >
                            → {nameOf.get(a.to) ?? `#${a.to}`}
                        </button>
                    );
                })}
            </>
        );
    };

    const tabs: {id: Tab; label: string}[] = [
        {id: 'profil', label: 'Mon profil'},
        {id: 'plan', label: `Plan (${matrixProfiles.length})`},
    ];

    return (
        <div style={{padding: 12, overflow: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 10}}>
            <div style={{display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap'}}>
                <h3 style={{margin: 0}}>Transfert techno</h3>
                <div style={{display: 'flex', gap: 4}}>
                    {tabs.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            style={{
                                ...panel, padding: '6px 12px', cursor: 'pointer',
                                background: tab === t.id ? '#2c3e50' : '#181818',
                                color: tab === t.id ? '#fff' : '#aaa',
                            }}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
                {tour !== undefined && <span className="badge" style={{background: '#123', color: '#ddd'}}>Tour {tour}</span>}
            </div>

            {tab === 'profil' && (
                <div style={{display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start'}}>
                    <div style={{flex: 1, minWidth: 340, ...panel}}>
                        <h4 style={{marginTop: 0}}>Mon profil</h4>
                        {!rapport && (
                            <p style={{color: '#aaa'}}>Chargez un rapport.xml pour générer votre profil.</p>
                        )}
                        {rapport && ownProfile && (
                            <>
                                <div style={{display: 'flex', gap: 8, marginBottom: 8}}>
                                    <span className="badge" style={{background: '#123', color: '#ddd'}}>
                                        Connues : {(rapport.technologiesConnues ?? []).length}
                                    </span>
                                    <span className="badge" style={{background: '#123', color: '#ddd'}}>
                                        Atteignables : {(rapport.technologiesAtteignables ?? []).length}
                                    </span>
                                </div>
                                <textarea
                                    readOnly
                                    value={encodeProfile(ownProfile)}
                                    onFocus={e => e.target.select()}
                                    style={{
                                        width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: '0.75em',
                                        background: '#0f0f10', color: '#7ec67e', border: '1px solid #444', borderRadius: 4, padding: 8, height: 90,
                                    }}
                                />
                                <div style={{display: 'flex', gap: 8, marginTop: 8}}>
                                    <button onClick={() => copyText(encodeProfile(ownProfile), "Profil copié ! À coller dans le canal Discord.")}>
                                        Copier mon profil
                                    </button>
                                </div>
                            </>
                        )}
                    </div>

                    <div style={{flex: 1, minWidth: 340, ...panel}}>
                        <h4 style={{marginTop: 0}}>Souhaits <span style={{color: '#888', fontWeight: 'normal'}}>(ordre = priorité)</span></h4>
                        <SearchableSelect options={researchableOptions} value="" onChange={addWish} placeholder="Ajouter un souhait…" style={{minWidth: 280}} />
                        <div style={{display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10}}>
                            {manual.wishes.length === 0 && <span style={{color: '#555', fontStyle: 'italic'}}>Aucun souhait.</span>}
                            {manual.wishes.map((code, i) => (
                                <div key={code} style={{display: 'flex', gap: 6, alignItems: 'center', background: '#222', borderRadius: 4, padding: '4px 8px'}}>
                                    <span style={{color: '#888', fontSize: '0.8em', width: 16}}>{i + 1}.</span>
                                    <span style={{flex: 1}}>{techLabel(code, techs)}</span>
                                    <button onClick={() => moveWish(i, -1)} disabled={i === 0} title="Monter en priorité">↑</button>
                                    <button onClick={() => moveWish(i, 1)} disabled={i === manual.wishes.length - 1} title="Descendre en priorité">↓</button>
                                    <button onClick={() => removeWish(code)} style={{color: '#f55'}} title="Retirer">×</button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{flex: 1, minWidth: 340, ...panel}}>
                        <h4 style={{marginTop: 0}}>Recherches en cours</h4>
                        <SearchableSelect options={researchableOptions} value="" onChange={addInProgress} placeholder="Ajouter une recherche…" style={{minWidth: 280}} />
                        <div style={{display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10}}>
                            {manual.inProgress.length === 0 && <span style={{color: '#555', fontStyle: 'italic'}}>Rien en cours.</span>}
                            {manual.inProgress.map(code => (
                                <div key={code} style={{display: 'flex', gap: 6, alignItems: 'center', background: '#222', borderRadius: 4, padding: '4px 8px'}}>
                                    <span style={{flex: 1}}>{techLabel(code, techs)}</span>
                                    <button onClick={() => removeInProgress(code)} style={{color: '#f55'}} title="Retirer">×</button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {tab === 'plan' && (
                <div style={{display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0}}>
                    <div style={{display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center'}}>
                        {matrixProfiles.map(p => (
                            <span key={p.num} className="badge" style={{background: '#223', color: '#ccc', display: 'inline-flex', alignItems: 'center', gap: 6}}>
                                {p.num === rapport?.joueur.numero ? 'Vous' : p.nom}
                                <span style={{color: '#888', fontSize: '0.85em'}}>({p.known.length} connues)</span>
                                <button onClick={() => removeOne(p)} style={{cursor: 'pointer', background: 'none', border: 'none', color: '#f55'}} title="Retirer">×</button>
                            </span>
                        ))}
                        <button onClick={() => setImportOpen(true)}>Importer des profils</button>
                    </div>

                    {matrixProfiles.length === 0 && (
                        <p style={{color: '#aaa'}}>
                            Aucun profil pour le tour {tour ?? '?'} : importez les codes reçus (bouton ci-dessus).
                        </p>
                    )}

                    <div style={{display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center'}}>
                        <input
                            type="text"
                            value={filterText}
                            onChange={e => setFilterText(e.target.value)}
                            placeholder="Filtrer nom ou code…"
                            style={{...selStyle, minWidth: 220}}
                        />
                        <select value={filterType} onChange={e => setFilterType(e.target.value as 'all' | '0' | '1' | '-1')} style={selStyle}>
                            <option value="all">Tout</option>
                            <option value="0">Bâtiments</option>
                            <option value="1">Composants</option>
                            <option value="-1">Maitrises</option>
                        </select>
                        <label style={{color: '#ccc', fontSize: '0.9em'}}><input type="checkbox" checked={onlyWished} onChange={e => setOnlyWished(e.target.checked)} /> Souhaitées</label>
                        <label style={{color: '#ccc', fontSize: '0.9em'}}><input type="checkbox" checked={onlyGaps} onChange={e => setOnlyGaps(e.target.checked)} /> Gaps (souhaitées, personne n'a)</label>
                        <label style={{color: '#ccc', fontSize: '0.9em'}}><input type="checkbox" checked={showAllRows} onChange={e => setShowAllRows(e.target.checked)} /> Toutes les technos</label>
                    </div>

                    <div style={{display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center'}}>
                        <button
                            onClick={() => {
                                // Deux clics pour vider (pas de confirm() possible)
                                if (!confirmClear) {
                                    setConfirmClear(true);
                                    return;
                                }
                                setPlan([]);
                                setConfirmClear(false);
                            }}
                            disabled={plan.length === 0}
                            style={confirmClear ? {background: '#822', color: '#fff'} : undefined}
                        >
                            {confirmClear ? 'Confirmer ?' : 'Vider'}
                        </button>
                        <button onClick={() => copyText(planText, 'Plan copié pour Discord.')} disabled={!planText}>
                            Copier le texte (Discord)
                        </button>
                        <span style={{flex: 1}} />
                        <label style={{color: '#ccc', fontSize: '0.9em'}}>
                            Mes actions :
                            <select
                                value={viewerNum}
                                onChange={e => setViewerNum(e.target.value === '' ? '' : Number(e.target.value))}
                                style={{...selStyle, marginLeft: 6}}
                            >
                                <option value="">— toutes —</option>
                                {matrixProfiles.map(p => (
                                    <option key={p.num} value={p.num}>{p.num === rapport?.joueur.numero ? 'Vous' : p.nom}</option>
                                ))}
                            </select>
                        </label>
                    </div>

                    {notice && <div style={{color: '#f55', fontSize: '0.85em'}}>{notice}</div>}

                    {hasErrors && (
                        <div style={{color: '#f55', fontSize: '0.9em'}}>
                            Le plan contient des erreurs (pastilles rouges) — règle du jeu : 1 techno donnée et 1 reçue par joueur et par tour.
                        </div>
                    )}

                    <div style={{overflow: 'auto', border: '1px solid #333', borderRadius: 4, flex: 1, minHeight: 120}}>
                        <table style={{borderCollapse: 'collapse', fontSize: '0.85em'}}>
                            <thead>
                                <tr>
                                    <th style={{position: 'sticky', left: 0, top: 0, background: '#1a1a1a', color: '#aaa', textAlign: 'left', padding: '6px 8px', border: '1px solid #333', zIndex: 2}}>Technologie</th>
                                    <th style={{position: 'sticky', top: 0, background: '#1a1a1a', color: '#aaa', padding: '6px 8px', border: '1px solid #333', zIndex: 1, whiteSpace: 'nowrap'}}>Coût</th>
                                    <th style={{position: 'sticky', top: 0, background: '#1a1a1a', color: '#aaa', padding: '6px 8px', border: '1px solid #333', zIndex: 1, whiteSpace: 'nowrap'}}>Nombre</th>
                                    {matrixProfiles.map(p => (
                                        <th key={p.num} style={{position: 'sticky', top: 0, background: '#1a1a1a', color: '#ccc', padding: '6px 8px', border: '1px solid #333', zIndex: 1, whiteSpace: 'nowrap'}}>
                                            {p.num === rapport?.joueur.numero ? 'Vous' : p.nom}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(row => (
                                    <tr key={row.tech.code} style={{opacity: dragging !== null && dragging.code !== row.tech.code ? 0.4 : 1}}>
                                        <td style={{position: 'sticky', left: 0, background: '#141414', padding: '4px 8px', border: '1px solid #2a2a2a', whiteSpace: 'nowrap', zIndex: 1}}>
                                            <span style={{color: '#888'}}>{typeTag(row.tech)}</span> {formatTechName(row.tech)}
                                            {row.gap && <span style={{color: '#f55', marginLeft: 8, fontSize: '0.85em'}}>personne n'a</span>}
                                        </td>
                                        <td style={{padding: '4px 8px', border: '1px solid #2a2a2a', whiteSpace: 'nowrap', color: '#9a9a9a', textAlign: 'right'}}>{row.tech.recherche.toLocaleString('fr-FR')}</td>
                                        <td style={{padding: '4px 8px', border: '1px solid #2a2a2a', whiteSpace: 'nowrap', textAlign: 'center', color: row.owners > 0 ? '#ccc' : '#555'}}>{row.owners}</td>
                                        {row.states.map((s, i) => {
                                            const p = matrixProfiles[i];
                                            // Cible de dépôt : le receveur peut rechercher la techno
                                            // (★ ou ▣), n'est pas le donneur, et n'a pas déjà reçu
                                            const isTarget = dragging !== null && dragging.from !== p.num && s.reach && !usedReceivers.has(p.num);
                                            const canDrag = s.known && !usedGivers.has(p.num);
                                            return (
                                                <td
                                                    key={i}
                                                    draggable={canDrag}
                                                    onDragStart={canDrag ? (e) => {
                                                        // setData requis pour que le drag démarre (Firefox)
                                                        e.dataTransfer.setData('text/plain', row.tech.code);
                                                        e.dataTransfer.effectAllowed = 'move';
                                                        setDragging({from: p.num, code: row.tech.code});
                                                    } : undefined}
                                                    onDragEnd={() => setDragging(null)}
                                                    onDragOver={isTarget ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } : undefined}
                                                    onDrop={isTarget ? (e) => { e.preventDefault(); setDragging(null); handleDrop(p); } : undefined}
                                                    style={{
                                                        textAlign: 'center', padding: '4px 8px', border: '1px solid #2a2a2a', whiteSpace: 'nowrap',
                                                        cursor: canDrag ? 'grab' : undefined,
                                                        backgroundColor: isTarget ? 'rgba(76,175,80,0.12)' : undefined,
                                                        outline: isTarget ? `1px solid ${C_KNOWN}` : undefined,
                                                    }}
                                                >
                                                    {renderCell(s, row, p)}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                                {rows.length === 0 && (
                                    <tr><td style={{padding: 12, color: '#555', textAlign: 'center'}}>Aucune techno ne correspond aux filtres.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div style={{color: '#888', fontSize: '0.85em'}}>
                        <span style={{color: C_KNOWN}}>✓</span> connaît (glisser-déposer pour transférer) ·{' '}
                        <span style={{color: C_REACH}}>▣</span> peut rechercher ·{' '}
                        <span style={{color: C_PROGRESS}}>→</span> en cours ·{' '}
                        <span style={{color: C_WISH}}>★</span> souhaitée ·{' '}
                        <span style={{...pillStyle, cursor: 'default'}}>→ Nom</span> transfert planifié (cliquer pour retirer) ·{' '}
                        ✓ gris = a déjà donné ce tour · ▣/★ gris = a déjà reçu ce tour · <span style={{color: C_REACH, backgroundColor: 'rgba(100,181,246,0.18)', padding: '0 3px', borderRadius: 3}}>▣</span> nouvelle techno pour l'alliance
                    </div>
                </div>
            )}

            {importOpen && (
                <Modal title="Importer des profils" showCloseButton onClose={closeImport}>
                    <p style={{color: '#aaa', fontSize: '0.9em'}}>
                        Collez les codes reçus sur Discord, un profil par ligne.
                        Pour un même tour et un même joueur, le dernier code reçu gagne.
                    </p>
                    <textarea
                        value={importText}
                        onChange={e => setImportText(e.target.value)}
                        rows={6}
                        placeholder="Collez les codes ici…"
                        style={{
                            width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: '0.75em',
                            background: '#0f0f10', color: '#ddd', border: '1px solid #444', borderRadius: 4, padding: 8,
                        }}
                    />
                    <div style={{display: 'flex', gap: 8, marginTop: 10}}>
                        <button onClick={runImport} disabled={!importText.trim()}>Importer</button>
                        <button onClick={closeImport}>Annuler</button>
                    </div>
                    {importResult && (
                        <div style={{marginTop: 10, fontSize: '0.9em'}}>
                            {importResult.count > 0 && (
                                <div style={{color: C_KNOWN}}>
                                    {importResult.count} profil(s) importé(s). Pensez à passer à l'onglet « Plan ».
                                </div>
                            )}
                            {importResult.errors.length > 0 && (
                                <div style={{color: '#f55'}}>
                                    {importResult.errors.length} ligne(s) illisible(s) :
                                    <ul style={{fontFamily: 'monospace', paddingLeft: 18}}>
                                        {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </Modal>
            )}
        </div>
    );
}