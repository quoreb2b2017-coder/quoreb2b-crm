db = db.getSiblingDB('quoreb2b_crm');

db.createUser({
  user: 'quoreb2b',
  pwd: 'quoreb2b_secret',
  roles: [{ role: 'readWrite', db: 'quoreb2b_crm' }],
});

db.createCollection('users');
db.createCollection('leads');
db.createCollection('companies');

print('MongoDB initialized for quoreb2b_crm');
