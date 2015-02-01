
aleph.factory('Query', ['$http', '$location', function($http, $location) {
  var query = {};

  var submit = function() {
    $location.search(query);
  }

  var ensureArray = function(data) {
    if (!angular.isArray(data)) {
      if (angular.isDefined(data) && data.length) {
        data = [data];
      } else {
        data = [];
      }
    }
    return data;
  };

  var load = function() {
    query = $location.search();
    query.mode = query.mode || 'table';
    query.collection = ensureArray(query.collection);
    query.entity = ensureArray(query.entity);
    return query;
  };

  var toggleFilter = function(name, val) {
    var idx = query[name].indexOf(val);
    if (idx == -1) {
      query[name].push(val);
    } else {
      query[name].splice(idx, 1);
    }
    submit();
  };

  var hasFilter = function(name, val) {
    return query[name].indexOf(val) != -1;
  };

  load();

  return {
      state: query,
      submit: submit,
      load: load,
      hasFilter: hasFilter,
      toggleFilter: toggleFilter
  };
}]);



aleph.controller('SearchCtrl', ['$scope', '$location', '$http', 'Query',
  function($scope, $location, $http, Query) {

  var collectionCount = 0;
  $scope.result = {};
  $scope.collections = {};

  $scope.toggleFilter = Query.toggleFilter;
  $scope.hasFilter = Query.hasFilter;

  $http.get('/api/1/collections').then(function(res) {
    var collections = {}
    angular.forEach(res.data.results, function(c) {
      collections[c.slug] = c;
    });
    $scope.collections = collections;
    collectionCount = res.data.total;
  });
  
  $scope.load = function() {
    var query = angular.copy(Query.load());
    query['limit'] = Query.state.mode == 'table' ? 35 : 0;
    $http.get('/api/1/query', {params: query}).then(function(res) {
      $scope.result = res.data;
    });
  };

  $scope.setMode = function(mode) {
    Query.state.mode = mode;
    Query.submit();
  };

  $scope.numQueriedCollections = function() {
    return $scope.query.collection.length || collectionCount;
  };

  $scope.$on('$routeUpdate', function(){
    $scope.load();
  });

  $scope.load();

}]);



aleph.controller('SearchListCtrl', ['$scope', '$location', '$http',
  function($scope, $location, $http) {
  var isLoading = false;

  $scope.hasMore = function() {
    return !isLoading && $scope.result.next_url !== null;
  };

  $scope.loadMore = function() {
    if (!$scope.$parent.result.next_url) {
      return;
    }
    isLoading = true;
    $http.get($scope.$parent.result.next_url).then(function(res) {
      $scope.$parent.result.results = $scope.$parent.result.results.concat(res.data.results);
      $scope.$parent.result.next_url = res.data.next_url;
      isLoading = false;
    });
  };

}]);


aleph.controller('SearchGraphCtrl', ['$scope', '$location', '$http', '$compile', 'debounce', 'Query',
  function($scope, $location, $http, $compile, debounce, Query) {

  var svg = d3.select("#graph svg"),
      linkContainer = svg.append("g"),
      nodeContainer = svg.append("g"),
      linkElements = null,
      nodeElements = null,
      force = d3.layout.force().linkStrength(0.2).gravity(0.1),
      graphData = {};

  var updateSize = function() {
    var width = $('#graph').width(),
        height = $(window).height() * 0.8;
    svg.attr("width", width)
       .attr("height", height);
    redraw(width, height);
  };

  var redraw = function(width, height) {
    if (graphData === null) return;

    var degreeExtent = d3.extent(graphData.nodes, function(n) { return n.degree});
    var nodeScale = d3.scale.sqrt().domain(degreeExtent).range([5, width/30]);
    var linkExtent = d3.extent(graphData.links, function(n) { return n.weight});
    var linkScale = d3.scale.sqrt().domain(linkExtent).range([1, width/100]);

    force = force
      .linkDistance(width/3)
      .size([width, height])
      .nodes(graphData.nodes)
      .links(graphData.links)
      .start();

    linkElements = linkContainer.selectAll(".link")
        .data(graphData.links, function(l) {
          return l.source.id + '.' + l.target.id;
        });

    linkElements.enter().append("line")
        .attr("class", "link")
        .style('stroke-width', function(d) { return linkScale(d.weight); })
        .style("stroke", '#fff')
        .transition()
          .duration(2000)
          .style("stroke", '#999');

    linkElements.exit().remove();

    nodeElements = nodeContainer.selectAll(".node")
        .data(graphData.nodes, function(n) { return n.id; });

    nodeElements.enter().append("circle")
        .attr("class", function(d) { return 'node ' + d.category; })
        .classed('active', function(d) { return Query.hasFilter('entity', d.id); })
        .attr("r", 2)
        .attr("tooltip-append-to-body", true)
        .attr("tooltip", function(d){ return d.label; })
        .on("click", function(d) {
          Query.toggleFilter('entity', d.id);
          $scope.$apply();
        })
        .call(force.drag)
        .transition()
          .duration(1000)
          .attr("r", function(d) { return nodeScale(d.degree); });

    nodeElements.exit().remove();

    //nodeElements.append("title")
    //    .text(function(d) { return d.label; });
    $compile($('#graph'))($scope);

    force.on("tick", function() {
      linkElements
          .attr("x1", function(d) { return d.source.x; })
          .attr("y1", function(d) { return d.source.y; })
          .attr("x2", function(d) { return d.target.x; })
          .attr("y2", function(d) { return d.target.y; });

      nodeElements
          .attr("cx", function(d) { return d.x; })
          .attr("cy", function(d) { return d.y; });
    });

  };

  var init = function() {
    $scope.load();
    $(window).resize(debounce(updateSize, 400));
  }

  $scope.load = function() {
    if (Query.state.mode != 'graph') return;
    var query = angular.copy(Query.load());
    $http.get('/api/1/graph', {params: query}).then(function(res) {
      graphData = res.data;
      updateSize();
    });
  };

  $scope.$on('$routeUpdate', function(){
    $scope.load();
  });

  init();
}]);




