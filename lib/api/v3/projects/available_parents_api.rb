#-- copyright
# OpenProject is a project management system.
# Copyright (C) 2012-2018 the OpenProject Foundation (OPF)
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License version 3.
#
# OpenProject is a fork of ChiliProject, which is a fork of Redmine. The copyright follows:
# Copyright (C) 2006-2017 Jean-Philippe Lang
# Copyright (C) 2010-2013 the ChiliProject Team
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License
# as published by the Free Software Foundation; either version 2
# of the License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program; if not, write to the Free Software
# Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
#
# See docs/COPYRIGHT.rdoc for more details.
#++

require 'api/v3/users/user_collection_representer'

module API
  module V3
    module Projects
      class AvailableParentsAPI < ::API::OpenProjectAPI
        resource :available_parent_projects do
          after_validation do
            authorize_any(%i[add_project edit_project], global: true)
          end

          get &::API::V3::Utilities::Endpoints::Index.new(model: Project,
                                                          scope: -> do
                                                            project = if params[:of]
                                                                        Project.find(params[:of])
                                                                      else
                                                                        Project.new
                                                                      end

                                                            contract_class = if project.new_record?
                                                                               ::Projects::CreateContract
                                                                             else
                                                                               ::Projects::UpdateContract
                                                                             end

                                                            contract = contract_class.new(project, current_user)

                                                            contract.assignable_parents.includes(:enabled_modules)
                                                          end)
                                                     .mount
        end
      end
    end
  end
end
