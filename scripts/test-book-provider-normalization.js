const assert = require('assert');
const {
  normalizeGoogleVolume,
} = require('../cloudfunctions/api/lib/bookProviders/googleBooks');
const {
  normalizeOpenLibraryBook,
  normalizeOpenLibrarySearchDoc,
} = require('../cloudfunctions/api/lib/bookProviders/openLibrary');

const googleVolume = {
  id: 'google-1',
  volumeInfo: {
    title: 'Guess How Much I Love You',
    authors: ['Sam McBratney'],
    publisher: 'Walker Books',
    publishedDate: '2007',
    description: 'A warm parent-child picture book.',
    categories: ['Juvenile Fiction'],
    industryIdentifiers: [
      { type: 'ISBN_10', identifier: '1406300405' },
      { type: 'ISBN_13', identifier: '9781406300406' },
    ],
    imageLinks: {
      thumbnail: 'http://books.google.com/books/content?id=google-1&printsec=frontcover&img=1&zoom=1',
    },
  },
};

const googleBook = normalizeGoogleVolume(googleVolume);
assert.strictEqual(googleBook.isbn, '9781406300406');
assert.strictEqual(googleBook.isbn10, '1406300405');
assert.strictEqual(googleBook.title, 'Guess How Much I Love You');
assert.strictEqual(googleBook.author, 'Sam McBratney');
assert.strictEqual(googleBook.publisher, 'Walker Books');
assert.strictEqual(googleBook.pubDate, '2007');
assert.strictEqual(googleBook.source, 'google_books');
assert.strictEqual(googleBook.sourceId, 'google-1');
assert.ok(googleBook.coverRemote.startsWith('https://books.google.com/'));

const openLibraryBook = normalizeOpenLibraryBook('ISBN:9781406300406', {
  title: 'Guess How Much I Love You',
  authors: [{ name: 'Sam McBratney' }],
  publishers: [{ name: 'Walker Books' }],
  publish_date: '2007',
  cover: { medium: 'https://covers.openlibrary.org/b/id/12345-M.jpg' },
  subjects: [{ name: 'Juvenile fiction' }],
});
assert.strictEqual(openLibraryBook.isbn, '9781406300406');
assert.strictEqual(openLibraryBook.title, 'Guess How Much I Love You');
assert.strictEqual(openLibraryBook.author, 'Sam McBratney');
assert.strictEqual(openLibraryBook.source, 'open_library');
assert.strictEqual(openLibraryBook.coverRemote, 'https://covers.openlibrary.org/b/id/12345-M.jpg');

const searchDoc = normalizeOpenLibrarySearchDoc({
  isbn: ['9781406300406', '1406300405'],
  title: 'Guess How Much I Love You',
  author_name: ['Sam McBratney'],
  publisher: ['Walker Books'],
  first_publish_year: 2007,
  cover_i: 12345,
  key: '/works/OL123W',
});
assert.strictEqual(searchDoc.isbn, '9781406300406');
assert.strictEqual(searchDoc.isbn10, '1406300405');
assert.strictEqual(searchDoc.sourceId, '/works/OL123W');
assert.strictEqual(searchDoc.coverRemote, 'https://covers.openlibrary.org/b/id/12345-M.jpg');

console.log('book provider normalization ok');
