$(function() {
    const perPage = 10;
    const maxResults = 50;
    const detailCache = {};
    let searchResults = [];
    let currentPage = 1;
    let selectedBook = null;
    let searchRequest = null;
    let collectionRequest = null;

    function showStatus(selector, message, error = false) {
        $(selector).text(message).toggleClass("error", error).show();
    }

    function coverUrl(id, size = "S") {
        return id ? "https://covers.openlibrary.org/b/id/" + encodeURIComponent(id) + "-" + size + ".jpg?default=false" : null;
    }

    function makeCover(id, title, size = "S") {
        const src = coverUrl(id, size);

        if (!src) {
            return $("<div>").addClass("empty-cover").text("Cover not available");
        }

        return $("<img>").attr({
            src: src,
            alt: "Cover of " + title,
            loading: "lazy"
        }).on("error", function() {
            $(this).replaceWith(
                $("<div>").addClass("empty-cover").text("Cover not available")
            );
        });
    }

    function getWorkId(book) {
        const match = (book.key || "").match(/^\/works\/(OL\d+W)$/);
        return match ? match[1] : "";
    }

    function renderBooks(books, target) {
        const $output = $(target).empty();

        books.forEach(function(book) {
            const title = book.title || "Untitled";
            const workId = book.workId || getWorkId(book);
            const coverId = book.cover_i || book.cover_id ||
                (Array.isArray(book.covers) ? book.covers.find(function(id) {
                    return Number(id) > 0;
                }) : null);

            const $card = $("<article>").addClass("book");
            $card.append(makeCover(coverId, title));

            const $heading = $("<h3>");
            const $select = $("<button>").attr("type", "button").text(title);

            $select.on("click", function() {
                if (workId) {
                    selectBook(book, workId);
                } else {
                    showStatus("#detailsStatus", "A Work ID is not available for this book.", true);
                }
            });

            $heading.append($select);
            $card.append($heading);

            if (book.author_name && book.author_name.length) {
                $card.append($("<p>").addClass("muted").text(book.author_name.slice(0, 3).join(", ")));
            } else if (book.authors && book.authors.length) {
                $card.append($("<p>").addClass("muted").text(book.authors.slice(0, 3).join(", ")));
            }

            $output.append($card);
        });
    }

    function updatePagination() {
        const pageCount = Math.max(1, Math.ceil(searchResults.length / perPage));
        $("#pagination").prop("hidden", searchResults.length <= perPage);
        $("#pageInfo").text("Page " + currentPage + " of " + pageCount);
        $("#previous").prop("disabled", currentPage <= 1);
        $("#next").prop("disabled", currentPage >= pageCount);
    }

    function showSearchPage() {
        const start = (currentPage - 1) * perPage;
        const pageBooks = searchResults.slice(start, start + perPage);

        renderBooks(pageBooks, "#results");
        updatePagination();
        showStatus("#searchStatus", "Showing " + pageBooks.length + " of " + searchResults.length + " results.");
    }

    function searchBooks() {
        const term = $("#query").val().trim();

        if (!term) {
            showStatus("#searchStatus", "Enter a search term before searching.", true);
            $("#query").focus();
            return;
        }

        if (searchRequest && searchRequest.readyState !== 4) {
            searchRequest.abort();
        }

        $("#searchButton").prop("disabled", true);
        $("#results").empty();
        $("#pagination").prop("hidden", true);
        showStatus("#searchStatus", "Loading books…");

        searchRequest = $.ajax({
            url: "https://openlibrary.org/search.json",
            data: {
                q: term,
                limit: maxResults,
                page: 1
            },
            dataType: "json",
            timeout: 15000
        }).done(function(data) {
            searchResults = Array.isArray(data.docs) ? data.docs.slice(0, maxResults) : [];
            currentPage = 1;

            if (!searchResults.length) {
                showStatus("#searchStatus", "No books matched your search. Try another title or keyword.");
                return;
            }

            showSearchPage();
        }).fail(function(xhr, status) {
            if (status !== "abort") {
                showStatus("#searchStatus", "Unable to load search results. Check your connection and try again.", true);
            }
        }).always(function() {
            $("#searchButton").prop("disabled", false);
        });
    }

    function getAuthors(authorKeys, fallbackNames) {
        const names = Array.isArray(fallbackNames) ? fallbackNames.slice() : [];

        if (!Array.isArray(authorKeys) || !authorKeys.length) {
            return $.Deferred().resolve(names).promise();
        }

        const requests = authorKeys.slice(0, 5).map(function(author) {
            const key = typeof author === "string" ? author : (author.key || (author.author && author.author.key));

            if (!key) {
                return $.Deferred().resolve(null).promise();
            }

            return $.ajax({
                url: "https://openlibrary.org" + key + ".json",
                dataType: "json",
                timeout: 12000
            }).then(function(data) {
                return data.name || null;
            }, function() {
                return null;
            });
        });

        return $.when.apply($, requests).then(function() {
            const returned = requests.length === 1 ? [arguments[0]] : Array.from(arguments).map(function(item) {
                return Array.isArray(item) ? item[0] : item;
            });
            const authorNames = returned.filter(Boolean);

            return authorNames.length ? authorNames : names;
        });
    }

    function renderDetails(book, workId, fallbackAuthors) {
        const title = book.title || "Untitled";
        const coverId = Array.isArray(book.covers) ? book.covers.find(function(id) {
            return Number(id) > 0;
        }) : null;
        const description = typeof book.description === "string" ?
            book.description :
            (book.description && typeof book.description === "object" ? book.description.value : "");
        const subjects = Array.isArray(book.subjects) ? book.subjects.slice(0, 10) : [];

        const $layout = $("<div>").addClass("details-layout");
        $layout.append(makeCover(coverId, title, "M").addClass("details-cover"));

        const $content = $("<div>");
        $content.append($("<h3>").text(title));
        $content.append(
            $("<p>").append(
                $("<strong>").text("Work ID: "),
                document.createTextNode(workId)
            )
        );

        getAuthors(book.authors, fallbackAuthors).then(function(authors) {
            $content.append($("<h3>").text("Author(s)"));
            $content.append(
                $("<p>").addClass(authors.length ? "" : "muted").text(
                    authors.length ? authors.join(", ") : "Author information not available."
                )
            );
        });

        $content.append($("<h3>").text("Description"));
        $content.append(
            $("<p>").addClass(description ? "" : "muted").text(
                description || "Description not available."
            )
        );

        $content.append($("<h3>").text("Subjects"));
        if (subjects.length) {
            const $list = $("<ul>").addClass("subjects");
            subjects.forEach(function(subject) {
                $list.append($("<li>").text(subject));
            });
            $content.append($list);
        } else {
            $content.append($("<p>").addClass("muted").text("Subjects not available."));
        }

        $content.append(
            $("<p>").append(
                $("<a>").attr({
                    href: "https://openlibrary.org/works/" + encodeURIComponent(workId),
                    target: "_blank",
                    rel: "noopener"
                }).text("View this work on Open Library")
            )
        );

        $layout.append($content);
        $("#details").empty().append($layout);
        showStatus("#detailsStatus", "Book details loaded.");
    }

    function selectBook(book, workId) {
        selectedBook = book;
        $("#details").empty();
        showStatus("#detailsStatus", "Loading book details…");

        if (detailCache[workId]) {
            renderDetails(detailCache[workId], workId, book.author_name);
            return;
        }

        $.ajax({
            url: "https://openlibrary.org/works/" + encodeURIComponent(workId) + ".json",
            dataType: "json",
            timeout: 15000
        }).done(function(data) {
            detailCache[workId] = data;
            renderDetails(data, workId, book.author_name);
        }).fail(function() {
            showStatus("#detailsStatus", "Unable to retrieve this book's details. Please select another book or try again.", true);
        });
    }

    function loadCollection() {
        if (collectionRequest && collectionRequest.readyState !== 4) {
            collectionRequest.abort();
        }

        showStatus("#collectionStatus", "Loading the science fiction collection…");

        collectionRequest = $.ajax({
            url: "https://openlibrary.org/subjects/science_fiction.json",
            data: {
                limit: 10
            },
            dataType: "json",
            timeout: 15000
        }).done(function(data) {
            const works = Array.isArray(data.works) ? data.works.slice(0, 10) : [];

            if (!works.length) {
                showStatus("#collectionStatus", "The science fiction collection is currently empty.");
                return;
            }

            const books = works.map(function(book) {
                return {
                    title: book.title,
                    key: book.key,
                    workId: (book.key || "").replace("/works/", ""),
                    cover_id: book.cover_id,
                    author_name: Array.isArray(book.authors) ? book.authors.map(function(author) {
                        return author.name;
                    }) : []
                };
            });

            renderBooks(books, "#collection");
            showStatus("#collectionStatus", "Showing " + books.length + " science fiction books.");
        }).fail(function(xhr, status) {
            if (status !== "abort") {
                showStatus("#collectionStatus", "Unable to load the collection. Please refresh the page to try again.", true);
            }
        });
    }

    $("#searchForm").on("submit", function(event) {
        event.preventDefault();
        searchBooks();
    });

    $("#previous").on("click", function() {
        if (currentPage > 1) {
            currentPage--;
            showSearchPage();
        }
    });

    $("#next").on("click", function() {
        const pageCount = Math.ceil(searchResults.length / perPage);

        if (currentPage < pageCount) {
            currentPage++;
            showSearchPage();
        }
    });

    loadCollection();
});
