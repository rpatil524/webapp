/* Evidence tables Directives */

angular.module('otDirectives')

    .directive('otRareDiseaseTable', ['otColumnFilter', 'otApi', 'otConsts', 'otUtils', 'otConfig', '$location', 'otDictionary', '$log', 'otClearUnderscoresFilter', function (otColumnFilter, otApi, otConsts, otUtils, otConfig, $location, otDictionary, $log, otClearUnderscoresFilter) {
        'use strict';

        var searchObj = otUtils.search.translateKeys($location.search());
        var checkPath = otUtils.checkPath;

        return {
            restrict: 'AE',

            templateUrl: 'src/components/rare-disease-table/rare-disease-table.html',

            scope: {
                output: '@?',    // optional output for filename export
                ext: '=?'       // optional external object to pass things out of the directive; TODO: this should remove teh need for all parameters above
            },

            link: function (scope, elem, attrs) {
                scope.ext.hasError = false;
                scope.$watchGroup([function () { return attrs.target; }, function () { return attrs.disease; }], function () {
                    if (attrs.target && attrs.disease) {
                        getData();
                    }
                });

                function getData () {
                    scope.ext.isLoading = true;
                    var opts = {
                        size: 1000,
                        datasource: otConfig.evidence_sources.genetic_association.rare,
                        fields: [
                            'disease.efo_info',
                            'evidence',
                            'variant',
                            'type',
                            'access_level',
                            'sourceID'
                        ]
                    };

                    if (attrs.target) {
                        opts.target = attrs.target;
                    }
                    if (attrs.disease) {
                        opts.disease = attrs.disease;
                    }
                    _.extend(opts, searchObj);

                    var queryObject = {
                        method: 'GET',
                        params: opts
                    };

                    return otApi.getFilterBy(queryObject)
                        .then(
                            function (resp) {
                                if (resp.body.data) {
                                    scope.ext.data = resp.body.data;
                                    initTable();
                                } else {
                                    $log.warn('Empty response : rare disease data');
                                }
                            },
                            otApi.defaultErrorHandler
                        )
                        .finally(function () {
                            scope.ext.isLoading = false;
                        });
                }


                /*
                 * Takes the data object returned by the API and formats it
                 * to an array of arrays to be displayed by the dataTable widget.
                 */
                function formatDataToArray (data) {
                    var newdata = [];
                    data.forEach(function (item) {
                        // create rows:
                        var row = [];

                        try {
                            var db = item.sourceID;

                            // col 0: data origin: public / private
                            row.push((item.access_level === otConsts.ACCESS_LEVEL_PUBLIC) ? otConsts.ACCESS_LEVEL_PUBLIC_DIR : otConsts.ACCESS_LEVEL_PRIVATE_DIR);

                            // disease
                            row.push(item.disease.efo_info.label);

                            // mutation
                            var mut = otDictionary.NA;
                            var variantString = otDictionary.NA;
                            if (checkPath(item, 'variant.id') && item.variant.id) {
                                var rsId = item.variant.id.split('/').pop();
                                variantString = rsId;
                                if (rsId.indexOf('rs') === 0) {
                                    mut = '<a class=\'ot-external-link\' href=http://www.ensembl.org/Homo_sapiens/Variation/Explore?v=' + rsId + ' target=_blank>' + rsId + '</a>';
                                } else if (rsId.indexOf('nsv') === 0) {
                                    mut = '<a class=\'ot-external-link\' href=http://www.ensembl.org/Homo_sapiens/StructuralVariation/Explore?sv=' + rsId + ' target=_blank>' + rsId + '</a>';
                                } else if (rsId.indexOf('RCV') === 0) {
                                    mut = '<a class=\'ot-external-link\' href=https://www.ncbi.nlm.nih.gov/clinvar/' + rsId + '/ target=_blank>' + rsId + '</a>';
                                } else {
                                    mut = rsId;
                                }
                            }
                            row.push(mut);

                            // mutation consequence
                            var cons = '';
                            if (item.type === 'genetic_association' && checkPath(item, 'evidence.gene2variant')) {
                                cons = otClearUnderscoresFilter(otUtils.getEcoLabel(item.evidence.evidence_codes_info, item.evidence.gene2variant.functional_consequence.split('/').pop()));
                            } else if (item.type === 'somatic_mutation') {
                                cons = otClearUnderscoresFilter(item.type);
                            } else {
                                cons = 'Curated evidence';
                            }
                            // Removed SO_0002165 hack
                            row.push(cons);

                            // Clinical consequences
                            var clin = 'N/A';
                            if (item.evidence.variant2disease && item.evidence.variant2disease.clinical_significance) {
                                // clin = item.evidence.variant2disease.clinical_significance;
                                clin = item.evidence.variant2disease.clinical_significance.join(', ')
                            }
                            row.push(clin);

                            // evidence source
                            var sourceString = '';
                            // Map source string to database name for a clean display in table filter
                            // Object.keys(otConsts.datasources).forEach(function (i) {
                            //     if (otConsts.datasources[i] && otConsts.datasources[i].id === db) {
                            //         sourceString = otConsts.datasources[i].label;
                            //     }
                            // });
                            if (item.type === 'genetic_association' && checkPath(item, 'evidence.variant2disease')) {
                                // The evidence.variant2disease.urls field is not required by the JSON schema,
                                // and therefore some datasources might not have it. Here we perform the check and set default values if needed
                                if (!item.evidence.variant2disease.urls || !checkPath(item.evidence.variant2disease, 'urls')) {
                                    item.evidence.variant2disease.urls = [{nice_name: '', url: ''}];
                                }
                                sourceString = sourceString || item.evidence.variant2disease.urls[0].nice_name;

                                var idString = '';
                                if (db === otConsts.datasources.EVA.id) {
                                    idString = '<p class="text-lowlight"><small>(ID: ' + item.evidence.variant2disease.urls[0].url.split('/').pop() + ')</small></p>';
                                }
                                row.push('<a class=\'ot-external-link\' href=\'' + item.evidence.variant2disease.urls[0].url + '\' target=_blank>' + sourceString + '</a>' + idString);
                            } else {
                                // TODO: Genomics England URLs are wrong, so (hopefully temporarily) we need to hack them in the UI
                                // TODO: We can't use otConsts.datasources.GENOMICS_ENGLAND here because the id in the data is wrongly assigned to 'Genomics England PanelApp'. This needs to be fixed at the data level
                                if (db === otConsts.datasources.GENOMICS_ENGLAND.id) {
                                    // item.evidence.urls[0].url = item.evidence.urls[0].url.replace('PanelApp', 'PanelApp/EditPanel');
                                    // item.evidence.urls[0].url = 'https://panelapp.genomicsengland.co.uk/panels/'; // Direct to generic panels page as Genomics England urls don't work.
                                }
                                if (db === otConsts.datasources.GENE_2_PHENOTYPE.id) {
                                    sourceString = sourceString || 'Further details in Gene2Phenotype database'; // item.evidence.urls[0].nice_name;
                                    row.push('<a class=\'ot-external-link\' href=\'' + item.evidence.urls[0].url + '\' target=_blank>' + sourceString + '</a>');
                                } else {
                                    sourceString = sourceString || item.evidence.urls[0].nice_name;
                                    row.push('<a class=\'ot-external-link\' href=\'' + item.evidence.urls[0].url + '\' target=_blank>' + item.evidence.urls[0].nice_name + '</a>');
                                }
                            }

                            // publications
                            var refs = [];

                            if (item.type === 'genetic_association') {
                                if (checkPath(item, 'evidence.variant2disease.provenance_type.literature')) {
                                    refs = item.evidence.variant2disease.provenance_type.literature.references;
                                } else if (checkPath(item, 'evidence.provenance_type.literature.references')) {
                                    // this code might be redundant here:
                                    // perhaps we don't need to check against genetic_association,
                                    // but just check whether there is variant2disease field etc...
                                    refs = item.evidence.provenance_type.literature.references;
                                }
                            } else {
                                if (checkPath(item, 'evidence.provenance_type.literature.references')) {
                                    refs = item.evidence.provenance_type.literature.references;
                                }
                            }

                            var pmidsList = otUtils.getPmidsList(refs);

                            // TODO: https://github.com/opentargets/webapp/issues/226
                            if ((pmidsList.length === 1) && pmidsList[0] === 'NA') {
                                row.push('N/A');
                            } else {
                                row.push(pmidsList.length ? otUtils.getPublicationsString(pmidsList) : 'N/A');
                            }

                            // Publication ids (hidden)
                            row.push(pmidsList.join(', '));

                            // hidden columns for filtering
                            row.push(variantString); // variant
                            row.push(sourceString); // evidence source

                            newdata.push(row); // push, so we don't end up with empty rows
                        } catch (e) {
                            scope.ext.hasError = true;
                            $log.error('Error parsing rare disease data:');
                            $log.error(e);
                        }
                    });
                    return newdata;
                }

                var dropdownColumns = [1, 2, 3, 4, 5];

                function initTable () {
                    var table = elem[0].getElementsByTagName('table');
                    $(table).DataTable(otUtils.setTableToolsParams({
                        'data': formatDataToArray(scope.ext.data),
                        'ordering': true,
                        'order': [[1, 'asc']],
                        'autoWidth': false,
                        'paging': true,
                        'columnDefs': [
                            {
                                'targets': [0],    // the access-level (public/private icon)
                                'visible': otConfig.show_access_level,
                                'width': '3%'
                            },
                            {
                                'targets': [7],
                                'visible': false
                            },
                            {
                                'targets': [5, 6],
                                'width': '14%'
                            },
                            {
                                'targets': [3, 4],
                                'width': '20%'
                            },
                            {
                                'targets': [2],
                                'width': '14%',
                                'mRender': otColumnFilter.mRenderGenerator(8),
                                'mData': otColumnFilter.mDataGenerator(2, 8)
                            },
                            {
                                'targets': [5],
                                'width': '14%',
                                'mRender': otColumnFilter.mRenderGenerator(9),
                                'mData': otColumnFilter.mDataGenerator(5, 9)
                            }
                        ],
                        initComplete: otColumnFilter.initCompleteGenerator(dropdownColumns)
                    }, (scope.output ? scope.output + '-' : '') + '-rare_diseases'));
                }
            }
        };
    }]);
