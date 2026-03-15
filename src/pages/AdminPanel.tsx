import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../firestore-utils';
import { ArrowLeft, ShieldAlert, Trash2, Edit2, Save, X, Filter, Users, Shield, Copy, Mail } from 'lucide-react';
import { format } from 'date-fns';

interface Batch {
  id: string;
  name: string;
  university: string;
  year: number;
  department: string;
  invite_code: string;
  created_by: string;
  created_at: string;
}

interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  batch_id?: string;
}

export default function AdminPanel() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Batch>>({});
  
  // Date filter state
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Members modal state
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);

  const isSuperAdmin = profile?.role === 'super_admin' || user?.email === 'piyush19sn@gmail.com';
  const isBatchAdmin = profile?.role === 'admin';

  useEffect(() => {
    if (!isSuperAdmin && !isBatchAdmin) {
      navigate('/');
      return;
    }
    
    let qBatches;
    if (isSuperAdmin) {
      qBatches = query(collection(db, 'batches'));
    } else {
      qBatches = query(collection(db, 'batches'), where('id', '==', profile?.batch_id || ''));
    }

    const unsubscribeBatches = onSnapshot(qBatches, (snapshot) => {
      const fetchedBatches = snapshot.docs.map(doc => doc.data() as Batch);
      setBatches(fetchedBatches.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'batches');
    });

    let qUsers;
    if (isSuperAdmin) {
      qUsers = query(collection(db, 'users'));
    } else {
      qUsers = query(collection(db, 'users'), where('batch_id', '==', profile?.batch_id || ''));
    }

    const unsubscribeUsers = onSnapshot(qUsers, (snapshot) => {
      const fetchedUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile));
      setUsers(fetchedUsers);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    return () => {
      unsubscribeBatches();
      unsubscribeUsers();
    };
  }, [isSuperAdmin, isBatchAdmin, profile?.batch_id, navigate]);

  const handleDelete = async (batchId: string) => {
    if (!window.confirm('Are you sure you want to delete this batch? This action cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'batches', batchId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `batches/${batchId}`);
    }
  };

  const startEdit = (batch: Batch) => {
    setEditingId(batch.id);
    setEditForm(batch);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      await updateDoc(doc(db, 'batches', editingId), editForm);
      setEditingId(null);
      setEditForm({});
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `batches/${editingId}`);
    }
  };

  const toggleUserRole = async (targetUser: UserProfile) => {
    if (!window.confirm(`Are you sure you want to change ${targetUser.name}'s role?`)) return;
    try {
      const newRole = targetUser.role === 'admin' ? 'student' : 'admin';
      await updateDoc(doc(db, 'users', targetUser.id), { role: newRole });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${targetUser.id}`);
    }
  };

  const filteredBatches = batches.filter(batch => {
    if (!startDate && !endDate) return true;
    
    const batchDate = new Date(batch.created_at);
    let isValid = true;
    
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      if (batchDate < start) isValid = false;
    }
    
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      if (batchDate > end) isValid = false;
    }
    
    return isValid;
  });

  const getBatchMembers = (batchId: string) => {
    return users.filter(u => u.batch_id === batchId);
  };

  const handleCopyInviteLink = (inviteCode: string) => {
    const link = `${window.location.origin}/batch?invite=${inviteCode}`;
    navigator.clipboard.writeText(link);
    alert('Invite link copied to clipboard!');
  };

  const handleEmailInvite = (batchName: string, inviteCode: string) => {
    const link = `${window.location.origin}/batch?invite=${inviteCode}`;
    const subject = encodeURIComponent(`Join my batch "${batchName}" on BatchMind AI`);
    const body = encodeURIComponent(`Hello,\n\nI'd like to invite you to join my batch "${batchName}" on BatchMind AI.\n\nYou can join by clicking this link:\n${link}\n\nOr by entering this invite code on the join page: ${inviteCode}\n\nBest regards`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  if (!isSuperAdmin && !isBatchAdmin) return null;

  return (
    <div className="min-h-screen bg-zinc-50">
      <nav className="bg-white border-b border-zinc-200 px-6 py-4 flex items-center gap-4 sticky top-0 z-10">
        <Link to="/" className="text-zinc-500 hover:text-zinc-900 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex items-center gap-2 text-zinc-900 font-bold text-xl">
          {isSuperAdmin ? <ShieldAlert className="text-emerald-600" /> : <Shield className="text-emerald-600" />} 
          {isSuperAdmin ? 'Super Admin Panel' : 'Batch Admin Panel'}
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-6 mt-4">
        <h1 className="text-2xl font-bold text-zinc-900 mb-6">Manage Batches</h1>
        
        {/* Date Filter Section */}
        {isSuperAdmin && (
          <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm mb-6 flex flex-col sm:flex-row items-end gap-4">
            <div className="flex flex-col w-full sm:w-auto">
              <label className="text-sm font-medium text-zinc-700 mb-1 flex items-center gap-1">
                <Filter size={14} /> Start Date
              </label>
              <input 
                type="date" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none w-full"
              />
            </div>
            <div className="flex flex-col w-full sm:w-auto">
              <label className="text-sm font-medium text-zinc-700 mb-1">End Date</label>
              <input 
                type="date" 
                value={endDate} 
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none w-full"
              />
            </div>
            <div className="flex items-center w-full sm:w-auto">
              <button 
                onClick={() => { setStartDate(''); setEndDate(''); }}
                disabled={!startDate && !endDate}
                className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
              >
                Clear Filters
              </button>
            </div>
          </div>
        )}
        
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-zinc-600">
              <thead className="bg-zinc-50 text-zinc-900 font-medium border-b border-zinc-200">
                <tr>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">University</th>
                  <th className="px-6 py-4">Department</th>
                  <th className="px-6 py-4">Members</th>
                  <th className="px-6 py-4">Invite Code</th>
                  <th className="px-6 py-4">Created</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {filteredBatches.map(batch => {
                  const membersCount = getBatchMembers(batch.id).length;
                  return (
                    <tr key={batch.id} className="hover:bg-zinc-50/50 transition-colors">
                      {editingId === batch.id ? (
                        <>
                          <td className="px-6 py-4">
                            <input type="text" value={editForm.name || ''} onChange={e => setEditForm({...editForm, name: e.target.value})} className="w-full px-2 py-1 border rounded" />
                          </td>
                          <td className="px-6 py-4">
                            <input type="text" value={editForm.university || ''} onChange={e => setEditForm({...editForm, university: e.target.value})} className="w-full px-2 py-1 border rounded" />
                          </td>
                          <td className="px-6 py-4">
                            <input type="text" value={editForm.department || ''} onChange={e => setEditForm({...editForm, department: e.target.value})} className="w-full px-2 py-1 border rounded" />
                          </td>
                          <td className="px-6 py-4 font-medium">{membersCount}</td>
                          <td className="px-6 py-4">
                            <input type="text" value={editForm.invite_code || ''} onChange={e => setEditForm({...editForm, invite_code: e.target.value})} className="w-full px-2 py-1 border rounded" />
                          </td>
                          <td className="px-6 py-4 text-zinc-400">{format(new Date(batch.created_at), 'MMM d, yyyy')}</td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={saveEdit} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"><Save size={18} /></button>
                              <button onClick={cancelEdit} className="p-1.5 text-zinc-400 hover:bg-zinc-100 rounded-lg transition-colors"><X size={18} /></button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-6 py-4 font-medium text-zinc-900">{batch.name}</td>
                          <td className="px-6 py-4">{batch.university}</td>
                          <td className="px-6 py-4">{batch.department}</td>
                          <td className="px-6 py-4">
                            <button 
                              onClick={() => setSelectedBatch(batch)}
                              className="flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-medium bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-md transition-colors"
                            >
                              <Users size={14} /> {membersCount}
                            </button>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-emerald-600 font-medium">{batch.invite_code}</span>
                              <button 
                                onClick={() => handleCopyInviteLink(batch.invite_code)} 
                                className="p-1 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                                title="Copy Invite Link"
                              >
                                <Copy size={14} />
                              </button>
                              <button 
                                onClick={() => handleEmailInvite(batch.name, batch.invite_code)} 
                                className="p-1 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                title="Email Invite"
                              >
                                <Mail size={14} />
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-4">{format(new Date(batch.created_at), 'MMM d, yyyy')}</td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => startEdit(batch)} className="p-1.5 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit2 size={18} /></button>
                              {isSuperAdmin && (
                                <button onClick={() => handleDelete(batch.id)} className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={18} /></button>
                              )}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
                {filteredBatches.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-zinc-500">
                      {batches.length === 0 ? 'No batches found.' : 'No batches match the selected date range.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Members Modal */}
      {selectedBatch && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between p-4 border-b border-zinc-200">
              <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <Users className="text-emerald-600" size={20} />
                Batch Members
              </h2>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => handleCopyInviteLink(selectedBatch.invite_code)} 
                  className="p-1.5 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                  title="Copy Invite Link"
                >
                  <Copy size={18} />
                </button>
                <button 
                  onClick={() => handleEmailInvite(selectedBatch.name, selectedBatch.invite_code)} 
                  className="p-1.5 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Email Invite"
                >
                  <Mail size={18} />
                </button>
                <div className="w-px h-6 bg-zinc-200 mx-1"></div>
                <button 
                  onClick={() => setSelectedBatch(null)}
                  className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto p-4 flex-1">
              {getBatchMembers(selectedBatch.id).length > 0 ? (
                <ul className="space-y-3">
                  {getBatchMembers(selectedBatch.id).map(member => (
                    <li key={member.id} className="flex flex-col p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-medium text-zinc-900">{member.name || 'Anonymous User'}</span>
                          <span className="block text-sm text-zinc-500">{member.email}</span>
                          <span className="inline-block text-xs font-medium text-emerald-600 uppercase tracking-wider mt-1">
                            {member.role} {member.id === selectedBatch.created_by && '(Creator)'}
                          </span>
                        </div>
                        {member.role !== 'super_admin' && member.id !== user?.uid && member.id !== selectedBatch.created_by && (
                          <button
                            onClick={() => toggleUserRole(member)}
                            className="text-xs font-medium px-2 py-1 rounded border border-zinc-200 bg-white hover:bg-zinc-100 transition-colors"
                          >
                            {member.role === 'admin' ? 'Remove Admin' : 'Make Admin'}
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-center py-8 text-zinc-500">
                  No members in this batch yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
